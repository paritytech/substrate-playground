import * as path from 'path';
import { v4 } from 'uuid';
import * as fs from 'fs-extra';
import { PackOptions, pack } from 'tar-fs';
import * as gunzip from 'gunzip-maybe';
import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { BAD_REQUEST, METHOD_NOT_ALLOWED, NOT_FOUND, INTERNAL_SERVER_ERROR } from 'http-status-codes';
import { isEmpty } from '@theia/core/lib/common/objects';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { FileDownloadHandler } from '@theia/filesystem/lib/node/download/file-download-handler';
import { FileDownloadData } from '@theia/filesystem/lib/common/download/file-download-data';

async function archive(inputPath: string, outputPath: string, options: PackOptions): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
        pack(inputPath, options).pipe(gunzip()).pipe(fs.createWriteStream(outputPath)).on('finish', () => resolve()).on('error', e => reject(e));
    });
}

function ignoreBuildArtefacts(name: string) {
    const normalized = path.normalize(name);
    return normalized.includes('target') || normalized.includes('node_modules') || normalized.includes('.git');
}

@injectable()
export class PlaygroundSingleFileDownloadHandler extends FileDownloadHandler {

    async handle(request: Request, response: Response): Promise<void> {
        const { method, body, query } = request;
        if (method !== 'GET') {
            this.handleError(response, `Unexpected HTTP method. Expected GET got '${method}' instead.`, METHOD_NOT_ALLOWED);
            return;
        }
        if (body !== undefined && !isEmpty(body)) {
            this.handleError(response, `The request body must either undefined or empty when downloading a single file. The body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        if (query === undefined || query.uri === undefined || typeof query.uri !== 'string') {
            this.handleError(response, `Cannot access the 'uri' query from the request. The query was: ${JSON.stringify(query)}.`, BAD_REQUEST);
            return;
        }
        const uri = new URI(query.uri).toString(true);
        const filePath = FileUri.fsPath(uri);

        let stat: fs.Stats;
        try {
            stat = await fs.stat(filePath);
        } catch {
            this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
            return;
        }
        try {
            const downloadId = v4();
            const filePath = FileUri.fsPath(uri);
            const options = { root: "", filePath, downloadId, remove: false };
            if (!stat.isDirectory) {
                await this.prepareDownload(request, response, options);
            } else {
                const outputRootPath = await this.createTempDir(downloadId);
                const outputPath = path.join(outputRootPath, `${path.basename(filePath)}.tar.gz`);
                await archive(filePath, outputPath, {ignore: ignoreBuildArtefacts});
                options.filePath = outputPath;
                options.remove = true;
                options.root = outputRootPath;
                await this.prepareDownload(request, response, options);
            }
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

}

@injectable()
export class PlaygroundMultiFileDownloadHandler extends FileDownloadHandler {

    async handle(request: Request, response: Response): Promise<void> {
        const { method, body } = request;
        if (method !== 'PUT') {
            this.handleError(response, `Unexpected HTTP method. Expected PUT got '${method}' instead.`, METHOD_NOT_ALLOWED);
            return;
        }
        if (body === undefined) {
            this.handleError(response, 'The request body must be defined when downloading multiple files.', BAD_REQUEST);
            return;
        }
        if (!FileDownloadData.is(body)) {
            this.handleError(response, `Unexpected body format. Cannot extract the URIs from the request body. Body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        if (body.uris.length === 0) {
            this.handleError(response, `Insufficient body format. No URIs were defined by the request body. Body was: ${JSON.stringify(body)}.`, BAD_REQUEST);
            return;
        }
        for (const uri of body.uris) {
            try {
                await fs.access(FileUri.fsPath(uri));
            } catch {
                this.handleError(response, `The file does not exist. URI: ${uri}.`, NOT_FOUND);
                return;
            }
        }
        try {
            const downloadId = v4();
            const outputRootPath = await this.createTempDir(downloadId);
            const distinctUris = Array.from(new Set(body.uris.map(uri => new URI(uri))));
            const tarPaths: string[] = [];
            // We should have one key in the map per FS drive.
            for (const [rootUri, uris] of (await this.directoryArchiver.findCommonParents(distinctUris)).entries()) {
                const rootPath = FileUri.fsPath(rootUri);
                const entries = uris.map(FileUri.fsPath).map(p => path.relative(rootPath, p));
                const outputPath = path.join(outputRootPath, `${path.basename(rootPath)}.tar.gz`);
                await archive(rootPath, outputPath, {entries: entries, ignore: ignoreBuildArtefacts});
                tarPaths.push(outputPath);
            }
            const options = { filePath: '', downloadId, remove: true, root: outputRootPath };
            if (tarPaths.length === 1) {
                // tslint:disable-next-line:whitespace
                const [outputPath,] = tarPaths;
                options.filePath = outputPath;
                await this.prepareDownload(request, response, options);
            } else {
                // We need to tar the tars.
                const outputPath = path.join(outputRootPath, `theia-archive-${Date.now()}.tar`);
                options.filePath = outputPath;
                await this.archive(outputRootPath, outputPath, tarPaths.map(p => path.relative(outputRootPath, p)));
                await this.prepareDownload(request, response, options);
            }
        } catch (e) {
            this.handleError(response, e, INTERNAL_SERVER_ERROR);
        }
    }

}
import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, OpenerService, WidgetOpenerOptions, ApplicationShell, Widget, open } from "@theia/core/lib/browser";
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PreviewUri } from '@theia/preview/lib/browser/preview-uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';

/*
 Open initial files if defined, or README.
*/
@injectable()
export class DevcontainerSupport implements FrontendApplicationContribution {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    protected async workspaceRoot() {
        const roots = await this.workspaceService.roots;
        return roots[0];
    }

    async onStart(_app: FrontendApplication) {
        const uri = await this.locateDevcontainer();
        console.log(uri)
    }

    protected async locateDevcontainer(): Promise<URI | undefined> {
        const location: FileStat | undefined = (await this.workspaceService.roots)[0];
        if (!location || !location?.children) {
            return undefined;
        }
        for (const f of location.children) {
            if (!f.isDirectory) {
                const fileName = f.resource.path.base.toLowerCase();
                if (fileName.startsWith('readme.md')) {
                    return f.resource;
                }
            }
        }
        return undefined;
    }

    protected async revealFile(uri: URI, preview: boolean = false): Promise<void> {
        const previewUri = preview ? PreviewUri.encode(uri) : uri;
        const widget = await open(this.openerService, previewUri, <WidgetOpenerOptions>{ mode: 'reveal' });
        if (widget instanceof Widget) {
            this.shell.activateWidget(widget.id);
        }
    }

}
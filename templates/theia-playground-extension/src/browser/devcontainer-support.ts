import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, OpenerService, ApplicationShell } from "@theia/core/lib/browser";
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
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
        if (uri) {
            const file = await this.fileService.readFile(uri);
            const container = file.value.toString();
            console.log(container)
            /*
            if (container.postCommand) {

            }*/
        }
    }

    protected async locateDevcontainer(): Promise<URI | undefined> {
        const location: FileStat | undefined = (await this.workspaceService.roots)[0];
        if (!location || !location?.children) {
            return undefined;
        }
        for (const f of location.children) {
            if (f.isFile) {
                const fileName = f.resource.path.base.toLowerCase();
                if (fileName.startsWith('devcontainer.json')) {
                    return f.resource;
                }
            } else {
                const fileName = f.resource.path.base.toLowerCase();
                const f2 = await this.fileService.resolve(f.resource);
                if (fileName.startsWith('.devcontainer') && f2.children) {
                    for (const ff of f2.children) {
                        const ffileName = ff.resource.path.base.toLowerCase();
                        if (ffileName.startsWith('devcontainer.json')) {
                            return ff.resource;
                        }
                    }
                }
            }
            f.children
        }
        return undefined;
    }

}
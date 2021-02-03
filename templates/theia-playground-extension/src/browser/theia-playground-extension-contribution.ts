import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidgetOptions, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { FileStat } from '@theia/filesystem/lib/common/files';
import { FileDownloadService } from '@theia/filesystem/lib/browser/download/file-download-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { URI as VSCodeURI } from 'vscode-uri';

async function openTerminal(terminalService: TerminalService, options: TerminalWidgetOptions = {}): Promise<TerminalWidget> {
   const terminalWidget = await terminalService.newTerminal(options);
   await terminalWidget.start();
   await terminalService.open(terminalWidget);
   return terminalWidget;
}

function answer(type: string, uuid?: string, data?: any): void {
    window.parent.postMessage({type: type, uuid: uuid, data: data}, "*");
}

function updateStatus(status: ConnectionStatus): void {
    if (status === ConnectionStatus.OFFLINE) {
        answer("extension-offline");
    } else {
        answer("extension-online");
    }
}

function unmarshall(payload) {
    const {type, data} = payload;
    if (type) {
        switch(type) {
            case "URI":
                return VSCodeURI.parse(data);
            default:
                throw new Error(`Failed to unmarshall unknown type ${type}`);
        }
    } else {
        return payload;
    }
}

function registerBridge(registry, connectionStatusService, messageService) {
    // Listen to message from parent frame
    window.addEventListener('message', async (o) => {
        const {type, name, data, uuid} = o.data;
        if (type) { // Filter extension related message
            const status = connectionStatusService.currentStatus;
            if (status === ConnectionStatus.OFFLINE) {
                answer("extension-answer-offline", uuid);
                return;
            }

            switch (type) {
                case "action": {
                    try {
                        const result = await registry.executeCommand(name, unmarshall(data));
                        answer("extension-answer", uuid, result);
                    } catch (error) {
                        messageService.error(`Error while executing ${name}.`, error.message);
                        answer("extension-answer-error", uuid, {name: name, message: error.message, data: data});
                    }
                    break;
                }
                case "list-actions": {
                    answer("extension-answer", uuid, registry.commands);
                    break;
                }
                default:
                    if (type) {
                        const message = `Unknown extension type ${type}`;
                        console.error(message, o);
                        answer("extension-answer-error", uuid, message);
                    }
                    break;
            }
        }
    }, false);

    connectionStatusService.onStatusChange(() => updateStatus(connectionStatusService.currentStatus));

    const online = connectionStatusService.currentStatus === ConnectionStatus.ONLINE;
    answer("extension-advertise", "", {online: online});
}

async function locateDevcontainer(workspaceService: WorkspaceService, fileService: FileService): Promise<URI | undefined> {
    const location: FileStat | undefined = (await workspaceService.roots)[0];
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
            const f2 = await fileService.resolve(f.resource);
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

function replaceVariable(arg: string): string {
    return arg.replace("$HOST", window.location.host);
}

async function executeAction(type: string, args: Array<string>) : Promise<void> {
    const sanitizedArgs = args.map(replaceVariable);
    switch(type) {
        case "external-preview":
            window.open(sanitizedArgs[0]);
            break;
        default:
            console.error(`Unknown type: ${type}`);
    }
}

@injectable()
export class TheiaSubstrateExtensionCommandContribution implements CommandContribution {

    @inject(FileNavigatorContribution)
    protected readonly fileNavigatorContribution: FileNavigatorContribution;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FileDownloadService)
    protected readonly downloadService: FileDownloadService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ConnectionStatusService)
    protected readonly connectionStatusService: ConnectionStatusService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(FileService)
    protected readonly fileService: FileService;

    registerCommands(registry: CommandRegistry): void {
        if (window !== window.parent) {
            // Running in a iframe
            registerBridge(registry, this.connectionStatusService, this.messageService);
            const members = document.domain.split(".");
            document.domain = members.slice(members.length-2).join(".");
        }

        this.stateService.reachedState('ready').then(
            async () => {
                this.fileNavigatorContribution.openView({reveal: true});
                if (this.terminalService.all.length == 0) {
                    await openTerminal(this.terminalService);
                }
                const uri = await locateDevcontainer(this.workspaceService, this.fileService);
                if (uri) {
                    const file = await this.fileService.readFile(uri);
                    const { postStartCommand, postAttachCommand } = JSON.parse(file.value.toString());
                    if (typeof postStartCommand === "string") {
                        const terminal = this.terminalService.all[0];
                        terminal.sendText(postStartCommand+'\r');
                    }
                    if (typeof postAttachCommand === "string") {
                        const terminal = this.terminalService.all[0];
                        terminal.sendText(postAttachCommand+'\r');
                    }
                }
            }
        );
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(CommandRegistry)
    protected readonly registry: CommandRegistry;

    async registerMenus(menus: MenuModelRegistry): Promise<void> {
        const PLAYGROUND = [...MAIN_MENU_BAR, '8_playground'];
        menus.registerSubmenu(PLAYGROUND, 'Playground');
        const uri = await locateDevcontainer(this.workspaceService, this.fileService);
        if (uri) {
            const file = await this.fileService.readFile(uri);
            const { menuActions } = JSON.parse(file.value.toString());
            if (Array.isArray(menuActions)) {
                menuActions.forEach(({id, label, type, args}, i) => {
                    const command = {id: id, label: label};
                    this.registry.registerCommand(command, {
                        execute: async () => {
                            executeAction(type, args);
                        }
                    });

                    const index = `${i}_${id}`;
                    const MENU_ITEM = [...PLAYGROUND, index];
                    menus.registerMenuAction(MENU_ITEM, {
                        commandId: command.id
                    });
                });
            } else if (menuActions) {
                console.error(`Incorrect value for menuActions: ${menuActions}`);
            }
        }
    }

}

import { injectable, inject } from "inversify";
import { Client } from "@substrate/playground-api";
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

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const StopInstanceCommand = {
    id: 'TheiaSubstrateExtension.stop-instance-command',
    label: "Stop this instance"
};

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

function envFromDomain(domain: string) {
    switch(domain) {
        case "playground":
            return "production";
        case "playground-staging":
            return "staging";
        case "playground-dev":
            return "development";
    }
}

function instanceDetails() {
    const [id, domain] = window.location.host.split(".");
    return {
        instance: id,
        env: envFromDomain(domain)
    };
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

    registerCommands(registry: CommandRegistry): void {
        const {env, instance} = instanceDetails();
        registry.registerCommand(SendFeedbackCommand, {
            execute: () => window.open('https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true')
        });
        registry.registerCommand(StopInstanceCommand, {
            execute: async () => {
                const client = new Client({env: env});
                client.stopInstance(instance);
            }
        });

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
                const uri = await this.locateDevcontainer();
                if (uri) {
                    const file = await this.fileService.readFile(uri);
                    const { postStartCommand } = JSON.parse(file.value.toString());
                    if (typeof postStartCommand === "string") {
                        const terminal = this.terminalService.all[0];
                        terminal.sendText(postStartCommand+'\r');
                    }
                }
            }
        );
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const PLAYGROUND = [...MAIN_MENU_BAR, '8_playground'];
        //const PLAYGROUND_STOP_INSTANCE = [...PLAYGROUND, '1_links'];
        const PLAYGROUND_SEND_FEEDBACK = [...PLAYGROUND, '2_feedback'];
        menus.registerSubmenu(PLAYGROUND, 'Playground');
        /*menus.registerMenuAction(PLAYGROUND_STOP_INSTANCE, {
            commandId: StopInstanceCommand.id,
            order: "1"
        });*/
        menus.registerMenuAction(PLAYGROUND_SEND_FEEDBACK, {
            commandId: SendFeedbackCommand.id
        });
    }

}
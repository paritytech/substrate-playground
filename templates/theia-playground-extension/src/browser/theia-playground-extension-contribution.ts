import { injectable, inject } from "inversify";
import { Client } from "@substrate/playground-api";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileService } from "@theia/filesystem/lib/browser/file-service";
import { FileDownloadService } from '@theia/filesystem/lib/browser/download/file-download-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { URI as VSCodeURI } from 'vscode-uri';

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const StopInstanceCommand = {
    id: 'TheiaSubstrateExtension.stop-instance-command',
    label: "Stop this instance"
};

/*
 newTerminal(this.terminalService, "front-end", `${HOME}/substrate-front-end-template`, `REACT_APP_PROVIDER_SOCKET=${nodeWebsocket} yarn build && rm -rf front-end/ && mv build front-end && python -m SimpleHTTPServer ${port}\r`)
 async function newTerminal(terminalService: TerminalService, id: string, cwd: string, command: string) {
    const terminalWidget = await terminalService.newTerminal({cwd: cwd, id: id});
    await terminalWidget.start();
    await terminalService.open(terminalWidget);
    await terminalWidget.sendText(command)
}*/

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

    registerCommands(registry: CommandRegistry): void {
        const {env, instance} = instanceDetails();
        const client = new Client({env: env});
        registry.registerCommand(SendFeedbackCommand, {
            execute: () => window.open('https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true')
        });
        registry.registerCommand(StopInstanceCommand, {
            execute: async () => {
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
            () => this.fileNavigatorContribution.openView({reveal: true})
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
import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { CommonMenus } from "@theia/core/lib/browser";
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { MaybePromise } from '@theia/core/lib/common/types';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileDownloadService } from '@theia/filesystem/lib/browser/download/file-download-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { URI } from 'vscode-uri';

const hostname = window.location.hostname;
const localhost = hostname == "localhost";
const nodeWebsocket = localhost ? `ws://${hostname}:9944` : `wss://${hostname}/wss`;
const port = 8000;
const frontendURL = localhost ? `//${hostname}:${port}/front-end/` : `//${hostname}/front-end`;
const HOME = "/home/substrate/workspace";

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const StartFrontEndTerminalCommand = {
    id: 'TheiaSubstrateExtension.start-front-end-terminal-command',
    label: "Start Front-End"
};

export const OpenFrontEndCommand = {
    id: 'TheiaSubstrateExtension.open-front-end-command',
    label: "Open Front-End"
};

async function newTerminal(terminalService: TerminalService, id: string, cwd: string, command: string) {
    let terminalWidget = await terminalService.newTerminal({cwd: cwd, id: id});
    await terminalWidget.start();
    await terminalService.activateTerminal(terminalWidget);
    await terminalWidget.sendText(command)
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
                return URI.parse(data);
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

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(SendFeedbackCommand, {
            execute: () => window.open('https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true')
        });
        registry.registerCommand(StartFrontEndTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "front-end", `${HOME}/substrate-front-end-template`, `REACT_APP_PROVIDER_SOCKET=${nodeWebsocket} yarn build && rm -rf front-end/ && mv build front-end && python -m SimpleHTTPServer ${port}\r`)
        });
        registry.registerCommand(OpenFrontEndCommand, {
            execute: () => window.open(frontendURL)
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
        const SUBSTRATE_LINKS = [...CommonMenus.HELP, '1_links'];
        const SUBSTRATE_FEEDBACK = [...CommonMenus.HELP, '2_feedback'];
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: StartFrontEndTerminalCommand.id,
            order: "1"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenFrontEndCommand.id,
            order: "2"
        });
        menus.registerMenuAction(SUBSTRATE_FEEDBACK, {
            commandId: SendFeedbackCommand.id
        });
    }

}

function isLocalhost(location: string): boolean {
    return location.startsWith('localhost') || location.startsWith('http://localhost') || location.startsWith('https://localhost');
}

/*
 Replace localhost access with DNS
*/@injectable()
export class HTTPLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return isLocalhost(location) ? 2 : 0;
    }

    map(location: string): MaybePromise<string> {
        return location.replace(/localhost/, window.location.hostname);
    }

}
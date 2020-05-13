import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { CommonMenus } from "@theia/core/lib/browser";
import { ConnectionStatusService, ConnectionStatus } from '@theia/core/lib/browser/connection-status-service';
import { MaybePromise } from '@theia/core/lib/common/types';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileDownloadService } from '@theia/filesystem/lib/browser/download/file-download-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { GettingStartedCommand } from './getting-started/getting-started-contribution';
import Shepherd from 'shepherd.js';

const hostname = window.location.hostname;
const localhost = hostname == "localhost";
const nodeWebsocket = localhost ? `ws://${hostname}:9944` : `wss://${hostname}/wss`;
const polkadotAppsURL = `https://polkadot.js.org/apps/?rpc=${nodeWebsocket}`;
const port = 8000;
const frontendURL = localhost ? `//${hostname}:${port}/front-end/` : `//${hostname}/front-end`;
const HOME = "/home/substrate/workspace";

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const OpenPolkadotAppsCommand = {
    id: 'TheiaSubstrateExtension.open-polkadot-apps-command',
    label: "Polkadot Apps"
};

export const StartFrontEndTerminalCommand = {
    id: 'TheiaSubstrateExtension.start-front-end-terminal-command',
    label: "Start Front-End"
};

export const OpenFrontEndCommand = {
    id: 'TheiaSubstrateExtension.open-front-end-command',
    label: "Open Front-End"
};

export const TourCommand = {
    id: 'TheiaSubstrateExtension.tour-command',
    label: "Take the tour"
};

async function newTerminal(terminalService: TerminalService, id: string, cwd: string, command: string) {
    let terminalWidget = await terminalService.newTerminal({cwd: cwd, id: id});
    await terminalWidget.start();
    await terminalService.activateTerminal(terminalWidget);
    await terminalWidget.sendText(command)
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

    registerCommands(registry: CommandRegistry): void {
        const tour = new Shepherd.Tour({
            defaultStepOptions: {
                classes: 'shadow-md bg-purple-dark',
                scrollTo: true
            }
        });
        // tour.next
        tour.addStep({
            id: 'node-step',
            text: 'Create a terminal and launch your local substrate node.',
            buttons: [
                // TODO
              /*{
                text: 'Open a node terminal',
                action: () => this.commandRegistry.executeCommand(StartNodeTerminalCommand.id)
              },*/
              {
                text: 'Next',
                action: tour.next
              }
            ]
          });
        tour.addStep({
            id: 'polkadotjs-step',
            text: 'You now have a substrate node running. Now is a good time to inspect your chain using PolkadotJS Apps.',
            attachTo: { 
              element: '#shell-tab-node', 
              on: 'top'
            },
            buttons: [
              {
                text: 'Open PolkadotJS Apps',
                action: () => this.commandRegistry.executeCommand(OpenPolkadotAppsCommand.id)
              },
              {
                text: 'Next',
                action: tour.next
              }
            ]
          });
          tour.addStep({
            id: 'more-step',
            text: 'Find more helpful commands here!',
            classes: "shepherd-element-attached-bottom shepherd-element-attached-middle",
            attachTo: { 
              element: ".p-MenuBar-content li:nth-child(8)", 
              on: 'bottom left'
            },
            buttons: [
              {
                text: 'Done',
                action: tour.hide
              }
            ]
          });

        registry.registerCommand(SendFeedbackCommand, {
            execute: () => window.open('https://docs.google.com/forms/d/e/1FAIpQLSdXpq_fHqS_ow4nC7EpGmrC_XGX_JCIRzAqB1vaBtoZrDW-ZQ/viewform?edit_requested=true')
        });
        registry.registerCommand(OpenPolkadotAppsCommand, {
            execute: () => window.open(polkadotAppsURL)
        });
        registry.registerCommand(StartFrontEndTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "front-end", `${HOME}/substrate-front-end-template`, `REACT_APP_PROVIDER_SOCKET=${nodeWebsocket} yarn build && rm -rf front-end/ && mv build front-end && python -m SimpleHTTPServer ${port}\r`)
        });
        registry.registerCommand(OpenFrontEndCommand, {
            execute: () => window.open(frontendURL)
        });
        registry.registerCommand(TourCommand, {
            execute: () => tour.start()
        });

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

        // Listen to message from parent frame
        window.addEventListener('message', async (o) => {
            const type = o.data.type;
            const name = o.data.name;
            const data = o.data.data;
            const uuid = o.data.uuid;
            const status = this.connectionStatusService.currentStatus;

            if (status === ConnectionStatus.OFFLINE) {
                answer("extension-answer-offline", uuid);
                return;
            }

            switch (type) {
                case "action": {
                    try {
                        const result = await registry.executeCommand(name, data);
                        answer("extension-answer", uuid, result);
                    } catch (error) {
                        answer("extension-answer-error", uuid, {name: error.name, message: error.message});
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
        }, false);

        this.connectionStatusService.onStatusChange(() => updateStatus(this.connectionStatusService.currentStatus));

        const online = this.connectionStatusService.currentStatus === ConnectionStatus.ONLINE;
        answer(online ? "extension-online" : "extension-offline");

        //this.fileNavigatorContribution.openView({activate: true}); 
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const SUBSTRATE_LINKS = [...CommonMenus.HELP, '1_links'];
        const SUBSTRATE_TOUR = [...CommonMenus.HELP, '2_tour'];
        const SUBSTRATE_FEEDBACK = [...CommonMenus.HELP, '3_feedback'];
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: GettingStartedCommand.id,
            order: "1"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: StartFrontEndTerminalCommand.id,
            order: "3"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenFrontEndCommand.id,
            order: "4"
        });
        menus.registerMenuAction(SUBSTRATE_TOUR, {
            commandId: TourCommand.id
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
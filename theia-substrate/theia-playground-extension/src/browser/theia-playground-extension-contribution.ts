import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { MaybePromise } from '@theia/core/lib/common/types';
import URI from '@theia/core/lib/common/uri';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileDownloadService } from '@theia/filesystem/lib/browser/download/file-download-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { GettingStartedCommand } from './getting-started/getting-started-contribution';
import Shepherd from 'shepherd.js';

const hostname = window.location.hostname;
const localhost = hostname == "localhost";
const nodeWebsocket = localhost ? `wss://${hostname}:9944` : `wss://${hostname}/wss`;
const polkadotAppsURL = `https://polkadot.js.org/apps/?rpc=${nodeWebsocket}`;
const port = 8000;
const frontendURL = localhost ? `//${hostname}:${port}` : `//${hostname}/front-end`;

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const CompileNodeTerminalCommand = {
    id: 'TheiaSubstrateExtension.compile-node-terminal-command',
    label: "Compile Node"
};

export const StartNodeTerminalCommand = {
    id: 'TheiaSubstrateExtension.start-node-terminal-command',
    label: "Start Node"
};

export const PurgeChainTerminalCommand = {
    id: 'TheiaSubstrateExtension.purge-chain-terminal-command',
    label: "Purge chain"
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

export const DownloadArchiveCommand = {
    id: 'TheiaSubstrateExtension.download-archive-command',
    label: "Download archive"
};

async function newTerminal(terminalService: TerminalService, id: string, cwd: string, command: string) {
    let terminalWidget = await terminalService.newTerminal({cwd: cwd, id: id});
    await terminalWidget.start();
    await terminalService.activateTerminal(terminalWidget);
    await terminalWidget.sendText(command)
}

@injectable()
export class TheiaSubstrateExtensionCommandContribution implements CommandContribution {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FileDownloadService)
    protected readonly downloadService: FileDownloadService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

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
              {
                text: 'Open a node terminal',
                action: () => this.commandRegistry.executeCommand(StartNodeTerminalCommand.id)
              },
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
        registry.registerCommand(CompileNodeTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "compile-node", "/home/workspace/substrate-node-template", "cargo build --release\r")
        });
        registry.registerCommand(StartNodeTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "start-node", "/home/workspace/substrate-node-template", "./target/release/node-template --dev --ws-external\r")
        });
        registry.registerCommand(PurgeChainTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "purge-chain", "/home/workspace/substrate-node-template", "./target/release/node-template purge-chain --dev\r")
        });
        registry.registerCommand(OpenPolkadotAppsCommand, {
            execute: () => window.open(polkadotAppsURL)
        });
        registry.registerCommand(StartFrontEndTerminalCommand, {
            execute: () => newTerminal(this.terminalService, "front-end", "/home/workspace/substrate-front-end-template", `REACT_APP_PROVIDER_SOCKET=${nodeWebsocket} yarn build && rm -rf front-end/ && mv build front-end && python -m SimpleHTTPServer ${port}\r`)
        });
        registry.registerCommand(OpenFrontEndCommand, {
            execute: () => window.open(frontendURL)
        });
        registry.registerCommand(TourCommand, {
            execute: () => tour.start()
        });
        registry.registerCommand(DownloadArchiveCommand, {
            execute: async () => {
                const uris = this.workspaceService.tryGetRoots().map(r => new URI(r.uri));
                this.downloadService.download(uris);
            }
        });
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const SUBSTRATE = [...MAIN_MENU_BAR, '8_playground'];
        const SUBSTRATE_LINKS = [...SUBSTRATE, '1_links'];
        const SUBSTRATE_TOUR = [...SUBSTRATE, '2_tour'];
        const SUBSTRATE_FEEDBACK = [...SUBSTRATE, '3_feedback'];
        menus.registerSubmenu(SUBSTRATE, 'Substrate');
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: GettingStartedCommand.id,
            order: "1"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: CompileNodeTerminalCommand.id,
            order: "2"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: StartNodeTerminalCommand.id,
            order: "3"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: PurgeChainTerminalCommand.id,
            order: "4"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenPolkadotAppsCommand.id,
            order: "5"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: StartFrontEndTerminalCommand.id,
            order: "6"
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenFrontEndCommand.id,
            order: "7"
        });
        menus.registerMenuAction(SUBSTRATE_TOUR, {
            commandId: TourCommand.id
        });
        menus.registerMenuAction(SUBSTRATE_FEEDBACK, {
            commandId: SendFeedbackCommand.id
        });
        menus.registerMenuAction(SUBSTRATE_FEEDBACK, {
            commandId: DownloadArchiveCommand.id
        });
    }
}

function isLocalhost(location: string): boolean {
    return location.startsWith('localhost') || location.startsWith('http://localhost') || location.startsWith('https://localhost');
}

/*
 Replca localhost access with proper name
*/@injectable()
export class HTTPLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return isLocalhost(location) ? 2 : 0;
    }

    map(location: string): MaybePromise<string> {
        return location.replace(/localhost/, window.location.hostname);
    }

}
import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { MaybePromise } from '@theia/core/lib/common/types';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { GettingStartedCommand } from './getting-started/getting-started-contribution';
import Shepherd from 'shepherd.js';

const polkadotAppsURL = `https://polkadot.js.org/apps/?rpc=wss://${window.location.hostname}/wss`;
const frontendURL = `//${window.location.hostname}/front-end`;

export const SendFeedbackCommand = {
    id: 'TheiaSubstrateExtension.send-feedback-command',
    label: "Send feedback"
};

export const OpenPolkadotAppsCommand = {
    id: 'TheiaSubstrateExtension.open-polkadot-apps-command',
    label: "Polkadot Apps"
};

export const OpenFrontendCommand = {
    id: 'TheiaSubstrateExtension.open-front-end-command',
    label: "Open Frontend"
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

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

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
                action: () => newTerminal(this.terminalService, "node", "/home/workspace/substrate-node-template", "./target/release/node-template --dev --ws-external\r\n")
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
            text: 'You are done! Hack around and have fun!.',
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
        registry.registerCommand(OpenFrontendCommand, {
            execute: () => window.open(frontendURL)
        });
        registry.registerCommand(TourCommand, {
            execute: () => tour.start()
        });
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const PLAYGROUND = [...MAIN_MENU_BAR, '8_playground'];
        const PLAYGROUND_LINKS = [...PLAYGROUND, '1_links'];
        const PLAYGROUND_TOUR = [...PLAYGROUND, '2_tour'];
        const PLAYGROUND_FEEDBACK = [...PLAYGROUND, '3_feedback'];
        menus.registerSubmenu(PLAYGROUND, 'Playground');
        menus.registerMenuAction(PLAYGROUND_LINKS, {
            commandId: GettingStartedCommand.id
        });
        menus.registerMenuAction(PLAYGROUND_LINKS, {
            commandId: OpenPolkadotAppsCommand.id
        });
        menus.registerMenuAction(PLAYGROUND_LINKS, {
            commandId: OpenFrontendCommand.id
        });
        menus.registerMenuAction(PLAYGROUND_TOUR, {
            commandId: TourCommand.id
        });
        menus.registerMenuAction(PLAYGROUND_FEEDBACK, {
            commandId: SendFeedbackCommand.id
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
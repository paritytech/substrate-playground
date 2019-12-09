import { injectable } from "inversify";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { MaybePromise } from '@theia/core/lib/common/types';
import { GettingStartedCommand } from './getting-started/getting-started-contribution';
import Shepherd from 'shepherd.js';

const polkadotAppsURL = `https://polkadot.js.org/apps/?rpc=wss://${window.location.hostname}/wss`;
const frontendURL = `//${window.location.hostname}/front-end`;

const tour = new Shepherd.Tour({
    defaultStepOptions: {
        classes: 'shadow-md bg-purple-dark',
        scrollTo: true
    }
});
tour.addStep({
    id: 'example-step',
    text: 'This step is attached to the bottom of the <code>.p-TabBar-content</code> element.',
    attachTo: { 
      element: '.p-TabBar-content', 
      on: 'top'
    },
    classes: 'example-step-extra-class',
    buttons: [
      {
        text: 'Next',
        action: tour.next
      }
    ]
  });

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

@injectable()
export class TheiaSubstrateExtensionCommandContribution implements CommandContribution {

    registerCommands(registry: CommandRegistry): void {
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
        //const PLAYGROUND_TOUR = [...PLAYGROUND, '2_tour'];
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
        /*menus.registerMenuAction(PLAYGROUND_TOUR, {
            commandId: TourCommand.id
        });*/
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
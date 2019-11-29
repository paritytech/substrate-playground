import { injectable } from "inversify";
import { MAIN_MENU_BAR, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";

const polkadotAppsURL = `https://polkadot.js.org/apps/?rpc=wss:${window.location.hostname}/wss`;
const frontendURL = `${window.location.hostname}/front-end`;

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
    }

}

@injectable()
export class TheiaSubstrateExtensionMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const SUBSTRATE = [...MAIN_MENU_BAR, '8_substrate'];
        const SUBSTRATE_LINKS = [...SUBSTRATE, '1_links'];
        const SUBSTRATE_FEEDBACK = [...SUBSTRATE, '2_feedback'];
        menus.registerSubmenu(SUBSTRATE, 'Substrate');
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenPolkadotAppsCommand.id
        });
        menus.registerMenuAction(SUBSTRATE_LINKS, {
            commandId: OpenFrontendCommand.id
        });
        menus.registerMenuAction(SUBSTRATE_FEEDBACK, {
            commandId: SendFeedbackCommand.id
        });
    }
}

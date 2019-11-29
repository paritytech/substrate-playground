/**
 * Generated using theia-extension-generator
 */

import { TheiaSubstrateExtensionCommandContribution, TheiaSubstrateExtensionMenuContribution } from './theia-playground-extension-contribution';
import {
    CommandContribution,
    MenuContribution
} from "@theia/core/lib/common";
import { CustomGettingStartedWidget } from './custom-getting-started-widget';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';

import { ContainerModule } from "inversify";

export default new ContainerModule(bind => {
    // add your contribution bindings here
    
    bind(CommandContribution).to(TheiaSubstrateExtensionCommandContribution);
    bind(MenuContribution).to(TheiaSubstrateExtensionMenuContribution);
    
    bind(CustomGettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID, // Re-use the pre-existing `GettingStartedWidget` ID.
        // On creation, create the `CustomGettingStartedWidget` instead.
        createWidget: () => context.container.get<CustomGettingStartedWidget>(CustomGettingStartedWidget),
    })).inSingletonScope();
});

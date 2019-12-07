/**
 * Generated using theia-extension-generator
 */

import { HTTPLocationMapper, TheiaSubstrateExtensionCommandContribution, TheiaSubstrateExtensionMenuContribution } from './theia-playground-extension-contribution';
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { GettingStartedContribution } from './getting-started/getting-started-contribution';
import { GettingStartedWidget } from './getting-started/getting-started-widget';
import { WidgetFactory, FrontendApplicationContribution, bindViewContribution } from '@theia/core/lib/browser';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { ContainerModule } from "inversify";

export default new ContainerModule(bind => {
    // add your contribution bindings here
    
    bind(CommandContribution).to(TheiaSubstrateExtensionCommandContribution);
    bind(MenuContribution).to(TheiaSubstrateExtensionMenuContribution);
    bind(LocationMapper).to(HTTPLocationMapper).inSingletonScope();

    bindViewContribution(bind, GettingStartedContribution);
    bind(FrontendApplicationContribution).toService(GettingStartedContribution);
    bind(GettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<GettingStartedWidget>(GettingStartedWidget),
    })).inSingletonScope();
});

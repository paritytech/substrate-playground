/**
 * Generated using theia-extension-generator
 */

import { HTTPLocationMapper, TheiaSubstrateExtensionCommandContribution, TheiaSubstrateExtensionMenuContribution } from './theia-playground-extension-contribution';
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { ContainerModule } from "inversify";
import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    // add your contribution bindings here
    
    bind(CommandContribution).to(TheiaSubstrateExtensionCommandContribution);
    bind(MenuContribution).to(TheiaSubstrateExtensionMenuContribution);
    bind(LocationMapper).to(HTTPLocationMapper).inSingletonScope();
});

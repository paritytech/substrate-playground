/**
 * Main theia-extension entry point
 */

import { HTTPLocationMapper } from './http-location-mapper';
import { InitialFilesOpen } from './initial-files-open';
import { TheiaSubstrateExtensionCommandContribution, TheiaSubstrateExtensionMenuContribution } from './theia-playground-extension-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';
import { ContainerModule } from "inversify";
import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(InitialFilesOpen).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(InitialFilesOpen);

    bind(CommandContribution).to(TheiaSubstrateExtensionCommandContribution);
    bind(MenuContribution).to(TheiaSubstrateExtensionMenuContribution);
    bind(LocationMapper).to(HTTPLocationMapper).inSingletonScope();
});

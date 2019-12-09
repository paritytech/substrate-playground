import { injectable, inject } from 'inversify';
import { CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution, FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { GettingStartedWidget } from './getting-started-widget';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

/**
 * Triggers opening the `GettingStartedWidget`.
 */
export const GettingStartedCommand = {
    id: GettingStartedWidget.ID,
    label: GettingStartedWidget.LABEL
};

@injectable()
export class GettingStartedContribution extends AbstractViewContribution<GettingStartedWidget> implements FrontendApplicationContribution {

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    constructor() {
        super({
            widgetId: GettingStartedWidget.ID,
            widgetName: GettingStartedWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main',
            }
        });
    }

    async onStart(app: FrontendApplication): Promise<void> {
        this.stateService.reachedState('ready').then(
            () => this.openView({ reveal: true })
        );
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GettingStartedCommand, {
            execute: () => this.openView({ reveal: true }),
        });
    }

}
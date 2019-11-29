import * as React from 'react';
import { injectable } from 'inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';

/**
 * The `CustomGettingStartedWidget` extends the base `GettingStartedWidget`
 * by simply updating the method `renderHeader()` to display some other
 * content than that of the base class.
 */
@injectable() // Informs `Inversify` that the following class can be injected into a `Container`.
export class CustomGettingStartedWidget extends GettingStartedWidget {
    /**
     * The `renderHeader` method overrides that of the base class.
     */
    protected renderHeader(): React.ReactNode {
        return (
            <div className='gs-header'>
                <h1>Welcome to Substrate playground!</h1>
            </div>
        );
    }
}
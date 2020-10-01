import { injectable } from "inversify";
import { MaybePromise } from '@theia/core/lib/common/types';
import { LocationMapper } from '@theia/mini-browser/lib/browser/location-mapper-service';

function isLocalhost(location: string): boolean {
    return location.startsWith('localhost') || location.startsWith('http://localhost') || location.startsWith('https://localhost');
}

/*
 Replace localhost access with DNS
*/
@injectable()
export class HTTPLocationMapper implements LocationMapper {

    canHandle(location: string): MaybePromise<number> {
        return isLocalhost(location) ? 2 : 0;
    }

    map(location: string): MaybePromise<string> {
        return location.replace(/localhost/, window.location.hostname);
    }

}
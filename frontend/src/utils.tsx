import { IdentifiedResource, User, Session, ResourceType, ResourcePermission, Client } from "@substrate/playground-client";

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error("timeout"));
      }, ms)
      promise.then(resolve, reject);
    });
  }

export async function fetchWithTimeout(url: string, init: RequestInit = {cache: "no-store"}, ms = 30000): Promise<Response>  {
    return timeout(fetch(url, init), ms).catch(error => error);
}

export function formatDuration(s: number): string {
    const date = new Date(0);
    date.setSeconds(s);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const withMinutes = `${minutes}min`;
    if (hours) {
        return `${hours}h ${withMinutes}`;
    } else {
        return `${withMinutes}`;
    }
}

export function sessionDomain(session: Session): string {
    return `${session.userId}.${document.location.hostname}`;
}

export function sessionUrl(session: Session): string | null {
    switch (session.state.tag) {
        // TODO retrieve RepoVersion, extract ports
        case 'Running': {
            //TODO const ports = session.template.runtime?.ports;
            //const port = ports?.find(port => port.name == 'web')?.port || 80;
            return `//${sessionDomain(session)}`;
        }
        default: return null;
    }
}

export function mainSessionId(userId: string): string {
    return userId.toLocaleLowerCase();
}

export function find<T extends IdentifiedResource>(resources: T[], id: string): T | undefined {
    return resources.find(resource => resource.id == id);
}

export function remove<T extends IdentifiedResource>(resources: T[], id: string): T[] {
    return resources.filter(resource => resource.id !== id);
}

export function hasPermission(client: Client, user: User, resourceType: ResourceType, resourcePermission: ResourcePermission): boolean {
    // TODO
    return user.roles.find(async roleId => {
        const role = await client.getRole(roleId);
        role?.permissions[resourceType].find()
    }) != null;
}

export function canCustomizeSessionDuration(client: Client, user: User): boolean {
    return hasPermission(client, user, ResourceType.Session, {tag: "Custom", name: "CustomizeSessionDuration"});
}

export function canCustomizeSessionPoolAffinity(client: Client, user: User): boolean {
    return hasPermission(client, user, ResourceType.Session, {tag: "Custom", name: "CustomizeSessionPoolAffinity"});
}

export function canCustomizeSession(client: Client, user: User): boolean {
    return canCustomizeSessionDuration(client, user) || canCustomizeSession(client, user);
}

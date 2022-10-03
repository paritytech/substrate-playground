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
    return `${session.userId.toLowerCase()}.${document.location.hostname}`;
}

export function sessionUrl(session: Session): string | null {
    switch (session.state.type) {
        case 'Running': {
            // http://localhost:3000/?folder=/home/workspace
            // TODO extract this info from editor
            return `//${sessionDomain(session)}/?folder=/home`;
        }
        default: return null;
    }
}

export function find<T extends IdentifiedResource>(resources: T[], id: string): T | undefined {
    return resources.find(resource => resource.id == id);
}

export function remove<T extends IdentifiedResource>(resources: T[], id: string): T[] {
    return resources.filter(resource => resource.id !== id);
}

const customPermission = 'Custom';

export async function hasPermission(client: Client, user: User, resourceType: ResourceType, resourcePermission: ResourcePermission): Promise<boolean> {
    const permissions = (await client.getRole(user.role))?.permissions;
    if (permissions) {
        return permissions[resourceType]?.find(permission => {
            if (permission.type == customPermission) {
                return resourcePermission.type == customPermission && permission.name == resourcePermission.name;
            }
            return permission.type == resourcePermission.type;
        }) != null;
    } else {
        return false;
    }
}

export async function canCustomizeSessionDuration(client: Client, user: User): Promise<boolean> {
    return hasPermission(client, user, ResourceType.Session, {type: customPermission, name: "CustomizeSessionDuration"});
}

export async function canCustomizeSessionPoolAffinity(client: Client, user: User): Promise<boolean> {
    return hasPermission(client, user, ResourceType.Session, {type: customPermission, name: "CustomizeSessionPoolAffinity"});
}

export async function canCustomizeSession(client: Client, user: User): Promise<boolean> {
    return canCustomizeSessionDuration(client, user) || canCustomizeSession(client, user);
}

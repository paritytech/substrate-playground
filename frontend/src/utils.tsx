import { LoggedUser } from "@substrate/playground-client";

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

// User helpers

export function isParitytechMember(user: LoggedUser): boolean {
    return user.organizations.indexOf('paritytech') != -1;
}

export function canCustomizeDuration(user: LoggedUser): boolean {
    return user.admin || user.canCustomizeDuration || isParitytechMember(user);
}

export function canCustomizePoolAffinity(user: LoggedUser): boolean {
    return user.admin || user.canCustomizePoolAffinity || isParitytechMember(user);
}

export function hasAdminReadRights(user: LoggedUser): boolean {
    return user.admin || isParitytechMember(user);
}

export function hasAdminEditRights(user: LoggedUser): boolean {
    return user.admin;
}

import { History } from 'history';

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error("timeout"));
      }, ms)
      promise.then(resolve, reject);
    });
  }

export async function fetchWithTimeout(url: string, opts: Object = {cache: "no-store"}, ms: number = 30000): Promise<Response>  {
    return timeout(fetch(url, opts), ms).catch(error => error);
}

export function navigateToHomepage(history: History): void {
  history.push("/");
}

export function navigateToAdmin(history: History): void {
  history.push("/admin");
}

export function navigateToInstance(history: History, instanceUUID: string): void {
  const params = new URLSearchParams(location.search);
  params.delete("deploy");
  const query = params.toString();
  history.push(`/${instanceUUID}${query !== "" ? "?"+query  : ""}`);
}
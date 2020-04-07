function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error("timeout"));
      }, ms)
      promise.then(resolve, reject);
    });
  }

export async function fetchWithTimeout(url: string, opts: Object = {}, ms: number = 3000): Promise<Response>  {
    return timeout(fetch(url, opts), ms);
}
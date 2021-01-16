import test from 'ava';
import { chromium } from 'playwright';
import 'cross-fetch/polyfill';
import 'abort-controller/polyfill';

function playgroundDomain(env: string): string {
    switch (env) {
      case "dev":
        return "http://playground-dev.substrate.test";
      case "staging":
        return "https://playground-staging.substrate.dev";
      case "production":
        return "https://playground.substrate.dev";
      default:
        throw new Error(`Unrecognized env ${env}`);
    }
  }

test('should return 200', async function (t) {

  t.timeout(10000); // configure maximum test duration

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1'
  });
  const page = await context.newPage();
  page.route('**', route => {
    route.continue();
  });

  const env = process.env.ENV || "dev";
  const res = await page.goto(playgroundDomain(env));
  t.is(res.status(), 200);

  return browser.close();
});

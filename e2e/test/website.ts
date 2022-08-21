import { environmentTypeFromString, playgroundBaseURL } from '@substrate/playground-client';
import test from 'ava';
import { chromium } from 'playwright';

test('should return 200', async function (t) {

  t.timeout(10000); // configure maximum test duration

  const env = process.env.ENV;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1',
    ignoreHTTPSErrors: env == "dev" // Disable certificate checking for 'dev' env
  });
  const page = await context.newPage();
  page.route('**', route => {
    route.continue();
  });

  const res = await page.goto(playgroundBaseURL(environmentTypeFromString(env)));
  t.is(res.status(), 200);

  return browser.close();
});

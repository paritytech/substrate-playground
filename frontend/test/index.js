const { webkit } = require('playwright');

function playgroundDomain() {
    const env = process.env.ENVIRONMENT || "DEVELOPMENT";
    switch (env) {
        case "development":
            return "http://playground-dev.substrate.test";
        case "staging":
            return "https://playground-staging.substrate.dev/";
        case "production":
            return "https://playground.substrate.dev/";
        default:
          throw new Error(`Unrecognized env ${env}`);
    }
}

(async () => {
  const browser = await webkit.launch();
  const context = await browser.newContext({
    ignoreHTTPSError: true,
    userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1'
  });
  const page = await context.newPage();
  page.route('**', route => {
    console.log(route.request().url());
    route.continue();
  });
  try {
    const res = await page.goto(playgroundDomain());
    await browser.close();
    const status = res.status();
    if (status == 200) {
      process.exit(0);
    } else {
      console.error(`Got unexpected status code ${status}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
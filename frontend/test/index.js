const { chromium } = require('playwright');

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
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.112 Safari/535.1'
  });
  const page = await context.newPage();
  page.route('**', route => {
    route.continue();
  });
  try {
    const ghUser = process.env.GH_USER;
    const ghPassword = process.env.GH_PASSWORD;
    if (ghUser == null || ghPassword == null) {
      console.error("Must provide credentials to GH");
      process.exit(1);
    }
    // TODO log into GH

    const res = await page.goto(playgroundDomain());

    // TODO Do some tests

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
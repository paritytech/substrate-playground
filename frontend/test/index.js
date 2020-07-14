const { webkit } = require('playwright');

function playgroundDomain() {
    const env = process.env.ENVIRONMENT || "DEVELOPMENT";
    switch (env) {
        case "DEVELOPMENT":
            return "http://playground-dev.substrate.test";
        case "STAGING":
            return "https://playground-staging.substrate.dev/";
        case "PRODUCTION":
            return "https://playground.substrate.dev/";
    }
}

(async () => {
  const browser = await webkit.launch();
  const context = await browser.newContext({
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
    process.exit(res.status() == 200 ? 0 : 1);
  } catch {
    process.exit(1);
  }
})();
const { chromium } = require('playwright');

function playgroundDomain() {
    const env = process.env.ENVIRONMENT || "development";
    switch (env) {
        case "development":
            return "http://playground-dev.substrate.test/";
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

    const res = await page.goto(playgroundDomain());

    const status = res.status();
    if (status == 200) {

      await page.click('text=login');
      await page.fill('#login_field', ghUser);
      await page.fill('#password', ghPassword);
      await page.click('input[name=commit]');
      await page.waitForTimeout(4000);

      // Assuming the app is already authorized
      if (!page.url().startsWith(playgroundDomain())) {
        console.error(`GitHub authentication failed`, page.url());
        process.exit(1);
      }

      await page.click('text=create');
      await page.waitForNavigation();
      await page.waitForSelector('//*[@id="shell-tab-plugin-view-container:substrate"]');
      await page.click('//*[@id="shell-tab-plugin-view-container:substrate"]')
      await page.waitForSelector('text=Actions', {timeout: 5000})

      await browser.close();
      process.exit(0);
    } else {
      console.error(`Got unexpected status code ${status}`);

      await browser.close();
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
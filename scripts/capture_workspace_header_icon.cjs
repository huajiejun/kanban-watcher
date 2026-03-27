const { chromium } = require("playwright");

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error("缺少输出路径参数");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });

  try {
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await page.locator(".task-card-main").first().click();

    const pane = page.locator("workspace-conversation-pane").first();
    await pane.waitFor({ state: "visible" });

    const header = pane.locator(".dialog-header").first();
    await header.waitFor({ state: "visible" });
    await header.screenshot({ path: outputPath });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

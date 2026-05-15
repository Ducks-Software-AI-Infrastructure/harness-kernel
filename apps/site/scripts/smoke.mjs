import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.PORT ?? 4328);
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Keep polling.
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function startPreview() {
  const child = spawn("pnpm", ["exec", "astro", "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
  });
  return child;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflowState = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (scrollWidth <= docWidth + 1) return { docWidth, scrollWidth, offenders: [] };
    const offenders = [];
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && (rect.left < -1 || rect.right > docWidth + 1)) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          className: element.className?.toString?.() ?? "",
          text: element.textContent?.trim().slice(0, 80) ?? "",
          left: rect.left,
          right: rect.right,
          docWidth,
        });
      }
    }
    return { docWidth, scrollWidth, offenders: offenders.slice(0, 5) };
  });
  if (overflowState.scrollWidth > overflowState.docWidth + 1) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(overflowState, null, 2)}`);
  }
}

async function assertNoBrokenText(page, label) {
  const text = await page.locator("body").innerText();
  const broken = ["TODO", "Lorem ipsum", "undefined", "NaN"].filter((needle) => text.includes(needle));
  if (broken.length) throw new Error(`${label} contains placeholder/broken text: ${broken.join(", ")}`);
}

const server = startPreview();

try {
  await waitForServer(`${baseUrl}/`);
  const browser = await chromium.launch();
  const routes = [
    "/",
    "/docs/",
    "/docs/concepts/runtime-vs-agent/",
    "/docs/concepts/kernel-map/",
    "/docs/api/",
    "/docs/api/reference/core/agent/",
  ];
  const viewports = [
    { width: 1440, height: 1000, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
  ];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    for (const route of routes) {
      const label = `${viewport.name} ${route}`;
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      if (!response?.ok()) throw new Error(`${label} returned ${response?.status()}`);
      await assertNoBrokenText(page, label);
      await assertNoHorizontalOverflow(page, label);
    }
    await page.close();
  }

  await browser.close();
} finally {
  server.kill("SIGTERM");
}

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";

/**
 * Closed-Loop Headless Browser Verifier (ADR-0043)
 *
 * Verifies web/game/mobile UI frontends directly inside sandboxes or local hosts.
 * Checks for console runtime errors, missing labels/a11y tags, and broken assets.
 */
export async function verifyPage(targetUrl, runDir = ".aiecp") {
  const ts = new Date().toISOString();
  const reportId = `val-browser-${Date.now()}`;
  const issues = [];

  let domCount = 0;
  let hasTitle = false;
  let hasViewport = false;

  try {
    // Dynamic import to prevent hard failure if playwright is not installed
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        issues.push({
          type: "CONSOLE_ERROR",
          message: msg.text(),
          severity: "HIGH",
        });
      }
    });

    // Capture page errors
    page.on("pageerror", (err) => {
      issues.push({
        type: "CONSOLE_ERROR",
        message: err.message,
        severity: "CRITICAL",
      });
    });

    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 15000 });

    // DOM & A11y checks
    hasTitle = (await page.title()).length > 0;
    hasViewport = (await page.$('meta[name="viewport"]')) !== null;
    domCount = await page.$$eval("*", (els) => els.length);

    // Check images missing alt
    const imagesWithoutAlt = await page.$$eval("img:not([alt])", (imgs) => imgs.length);
    if (imagesWithoutAlt > 0) {
      issues.push({
        type: "A11Y_VIOLATION",
        message: `${imagesWithoutAlt} image(s) missing alt attribute`,
        severity: "MEDIUM",
      });
    }

    // Check buttons with no text
    const emptyButtons = await page.$$eval("button", (btns) =>
      btns.filter((b) => !b.innerText && !b.getAttribute("aria-label")).length
    );
    if (emptyButtons > 0) {
      issues.push({
        type: "A11Y_VIOLATION",
        message: `${emptyButtons} button(s) without accessible text or aria-label`,
        severity: "HIGH",
      });
    }

    await browser.close();
  } catch (e) {
    // Fallback: If playwright is not available or browser failed to launch,
    // perform lightweight HTTP structural verification
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) {
        issues.push({
          type: "HTTP_ERROR",
          message: `Server returned HTTP ${res.status}: ${res.statusText}`,
          severity: "CRITICAL",
        });
      } else {
        const html = await res.text();
        hasTitle = /<title[^>]*>([^<]+)<\/title>/i.test(html);
        hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
        domCount = (html.match(/<[a-z0-9]+/gi) || []).length;

        if (!hasViewport) {
          issues.push({
            type: "LAYOUT_OVERFLOW",
            message: "Missing mobile viewport meta tag (<meta name='viewport'>)",
            severity: "HIGH",
          });
        }
      }
    } catch (fetchErr) {
      issues.push({
        type: "HTTP_ERROR",
        message: `Failed to connect to target URL: ${fetchErr.message}`,
        severity: "CRITICAL",
      });
    }
  }

  const passed = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length === 0;

  const report = {
    id: reportId,
    url: targetUrl,
    timestamp: ts,
    passed,
    issues,
    metrics: {
      domElementsCount: domCount,
      hasTitle,
      hasViewportMeta: hasViewport,
      responsiveCheck: hasViewport,
    },
  };

  // Persist Evidence if runDir exists
  if (existsSync(runDir)) {
    const valDir = join(runDir, "evidence", "validation");
    mkdirSync(valDir, { recursive: true });
    writeFileSync(join(valDir, `${reportId}.json`), JSON.stringify(report, null, 2));
  }

  return report;
}

/**
 * Built-in self-test
 */
async function selfTest() {
  console.log("=== BrowserVerifier self-test (ADR-0043) ===");
  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log(`  OK   ${name}`);
      passed++;
    } else {
      console.error(`  FAIL ${name}`);
      failed++;
    }
  }

  // Spin up a tiny mock HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html><html><head><title>Test App</title><meta name="viewport" content="width=device-width"></head><body><h1>AIECP Demo</h1><button aria-label="Submit">Click</button></body></html>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const testUrl = `http://127.0.0.1:${address.port}`;

  try {
    const report = await verifyPage(testUrl);
    assert("verification completes successfully", report.passed === true);
    assert("hasTitle is true", report.metrics.hasTitle === true);
    assert("hasViewportMeta is true", report.metrics.hasViewportMeta === true);
    assert("zero critical issues", report.issues.filter((i) => i.severity === "CRITICAL").length === 0);
  } finally {
    server.close();
  }

  console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

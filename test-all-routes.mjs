// test-all-routes.mjs
//
// Full-app responsive health check: tests every configured route across
// every breakpoint in a single run. Good as a "before you deploy" step —
// 30 seconds tells you if anything broke, anywhere, at any size.
//
// SETUP (one-time, skip if you already did this for test-responsive.mjs):
//   npm install -D playwright
//   npx playwright install chromium
//
// USAGE:
//   node test-all-routes.mjs                        // uses http://localhost:5173
//   node test-all-routes.mjs http://localhost:5173   // explicit base URL
//
// ⚠️ EDIT THE ROUTES BELOW — replace the placeholder video ID / handle
// with real ones from your dev database before running.
//
// Exits with code 1 if ANY route/breakpoint combination fails — safe to
// wire into a pre-commit hook or CI if you want it to fail the build.

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE_URL = process.argv[2] || "http://localhost:5173";

// ── Edit this list as your app grows ───────────────────────────────────
const ROUTES = [
  { name: "Home",           path: "/",                     folder: "home" },
  { name: "Watch",          path: "/watch?v=QO5E8t6BPt8",   folder: "watch" },
  { name: "Channel",        path: "/@airstreamx",           folder: "channel" },
  { name: "Upload",         path: "/upload",                folder: "upload" },
  { name: "Shorts",         path: "/shorts",                folder: "shorts" },
  { name: "clip-generator", path: "/clip-generator",        folder: "clip-generator" },
  // Add more as you fix more screens, e.g.:
  // { name: "Search",   path: "/?search=music",     folder: "search" },
  // { name: "Trending", path: "/trending",          folder: "trending" },
];

const BREAKPOINTS = [
  { name: "iPhone SE (smallest common)", width: 320, height: 568 },
  { name: "Small Android",               width: 360, height: 780 },
  { name: "iPhone 14/15",                width: 390, height: 844 },
  { name: "iPhone 14/15 Pro Max",        width: 430, height: 932 },
  { name: "iPad Mini (portrait)",        width: 768, height: 1024 },
  { name: "iPad Pro (portrait)",         width: 1024, height: 1366 },
  { name: "Laptop",                      width: 1366, height: 768 },
  { name: "Desktop FHD",                 width: 1920, height: 1080 },
];

const OUT_DIR = "./responsive-test-screenshots";
const allResults = []; // { routeName, routePath, bp, ok, overflow?, error? }

async function run() {
  const browser = await chromium.launch();
  // One page, reused for everything — just resize its viewport per
  // breakpoint instead of spawning/tearing down 32 separate pages.
  // (Repeated newPage()/close() cycles were the cause of the earlier
  // crash on Windows — this is both more robust and noticeably faster.)
  const page = await browser.newPage();

  console.log(`\nFull-app responsive check — ${BASE_URL}`);
  console.log(`Testing ${ROUTES.length} route(s) × ${BREAKPOINTS.length} breakpoint(s) = ${ROUTES.length * BREAKPOINTS.length} checks\n`);

  outer:
  for (const route of ROUTES) {
    const routeDir = `${OUT_DIR}/${route.folder}`;
    mkdirSync(routeDir, { recursive: true });

    for (const bp of BREAKPOINTS) {
      try {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "load", timeout: 20000 });
        await page.waitForTimeout(1200);

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));

        const overflow = scrollWidth - innerWidth;
        const safeName = bp.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        const screenshotPath = `${routeDir}/${bp.width}x${bp.height}-${safeName}.png`;

        await page.screenshot({ path: screenshotPath, fullPage: false });

        allResults.push({
          routeName: route.name,
          routePath: route.path,
          bp,
          ok: overflow <= 0,
          overflow,
          screenshotPath,
        });
      } catch (err) {
        const msg = String(err.message || err);
        allResults.push({
          routeName: route.name,
          routePath: route.path,
          bp,
          ok: false,
          error: msg.split("\n")[0],
        });

        // The browser/page itself died — every remaining check will fail
        // identically, so stop here instead of grinding through the rest.
        if (msg.includes("has been closed") || msg.includes("Target closed")) {
          console.error("\n⚠️  Browser crashed mid-run — stopping early instead of repeating the same failure.");
          console.error("   Common fixes: close any leftover Chromium/chrome.exe processes in Task Manager,");
          console.error("   then rerun. If it keeps happening, try restarting your terminal or machine.\n");
          break outer;
        }
      }
    }
  }

  try { await browser.close(); } catch { /* already gone */ }
}

// Catch anything that slips through (a bad route, a browser hiccup, etc.)
// so we always print whatever results we did collect instead of just
// dying with a raw Node warning and no report at all.
try {
  await run();
} catch (fatal) {
  console.error("\n⚠️  Test run stopped early:", fatal.message || fatal);
  console.error("Showing results collected before the failure:\n");
}

// ── Report ──────────────────────────────────────────────────────────
let anyFailed = false;

for (const route of ROUTES) {
  const routeResults = allResults.filter((r) => r.routePath === route.path);
  if (routeResults.length === 0) continue;

  console.log(`\n📄 ${route.name}  (${route.path})`);
  console.log("-".repeat(60));

  for (const r of routeResults) {
    const dims = `${r.bp.width}x${r.bp.height}`.padEnd(12);
    const name = r.bp.name.padEnd(28);
    if (r.error) {
      console.log(`  ${dims} ${name} ⚠️  ERROR: ${r.error}`);
      anyFailed = true;
    } else if (r.ok) {
      console.log(`  ${dims} ${name} ✅ OK`);
    } else {
      console.log(`  ${dims} ${name} 🚨 Overflow by ${r.overflow}px`);
      anyFailed = true;
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────
const total = allResults.length;
const passed = allResults.filter((r) => r.ok).length;
const failed = total - passed;

console.log("\n" + "=".repeat(60));
console.log(`SUMMARY: ${passed}/${total} passed` + (failed ? `, ${failed} failed` : ""));
console.log("=".repeat(60));

if (anyFailed) {
  console.log("\n❌ Issues found — check the breakdown above and the screenshots in:");
  console.log(`   ${OUT_DIR}/<route-folder>/`);
  process.exit(1);
} else {
  console.log(`\n✅ All routes clean across all breakpoints. Screenshots saved to: ${OUT_DIR}/`);
  process.exit(0);
}

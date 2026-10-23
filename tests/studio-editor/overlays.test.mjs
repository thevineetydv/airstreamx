// tests/studio-editor/overlays.test.mjs
//
// Phase 2 check: text, sticker, 📍 area tag and Local Deal banner.
// Adds each overlay, edits it, drags text on the preview, exports 720p and
// checks the overlays are really burned into the MP4 (pixel comparison
// against the source frame with ffmpeg).
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/overlays.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const FIXTURE = path.join(here, "fixtures", "landscape-6s.webm");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** One RGB frame at time t, scaled to w×h, as a Buffer. */
function frameRGB(file, t, w, h) {
  return execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
}
const px = (buf, w, x, y) => {
  const i = (y * w + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
};
/** Mean absolute difference over a square region. */
function regionDiff(a, b, w, cx, cy, r = 12) {
  let sum = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const p = px(a, w, x, y), q = px(b, w, x, y);
    sum += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    n += 3;
  }
  return sum / n;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// Centre of the non-transparent pixels on the overlay canvas (CSS px, relative to canvas).
const overlayCentre = () => page.getByTestId("overlay-canvas").evaluate((c) => {
  const ctx = c.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    if (data[(y * width + x) * 4 + 3] > 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const s = c.getBoundingClientRect().width / c.width;
  return { x: ((minX + maxX) / 2) * s, y: ((minY + maxY) / 2) * s };
});

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("file-input").setInputFiles([FIXTURE]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  // New projects start 9:16 (Phase 9). This test checks the landscape (Auto) canvas.
  await page.getByTestId("open-aspect").click();
  await page.getByTestId("aspect-auto").click();
  await page.getByTestId("aspect-done").click();

  const stage = await page.getByTestId("preview-stage").boundingBox();
  check("Preview stage uses export shape (16:9)", Math.abs(stage.width / stage.height - 16 / 9) < 0.02, `${stage.width}×${stage.height}`);

  // ── Text ──
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-panel").waitFor();
  await page.getByTestId("overlay-text").fill("Namaste Lucknow");
  await page.getByTestId("text-style-box").click();
  const before = await overlayCentre();
  check("Text drawn on preview", !!before);

  // Drag the text up by 60 CSS px on the preview.
  const canvasBox = await page.getByTestId("overlay-canvas").boundingBox();
  const sx = canvasBox.x + before.x, sy = canvasBox.y + before.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy - 30, { steps: 4 });
  await page.mouse.move(sx, sy - 60, { steps: 4 });
  await page.mouse.up();
  const after = await overlayCentre();
  check("Drag moves text on preview", after && Math.abs((before.y - after.y) - 60) < 8, `moved ${(before.y - after.y).toFixed(1)}px`);
  await page.screenshot({ path: `${SHOTS}/p2-01-text.png` });
  await page.getByTestId("overlay-done").click();

  // ── Sticker ──
  await page.getByTestId("tool-sticker").click();
  await page.getByRole("button", { name: "🎉" }).click();
  await page.getByTestId("overlay-done").click();

  // ── Area tag ──
  await page.getByTestId("tool-area").click();
  await page.getByTestId("overlay-area").fill("Hazratganj, Lucknow");
  await page.screenshot({ path: `${SHOTS}/p2-02-area.png` });
  await page.getByTestId("overlay-done").click();

  // ── Local Deal ──
  await page.getByTestId("tool-deal").click();
  await page.getByTestId("deal-offer").fill("Buy 1 Get 1");
  await page.getByTestId("deal-business").fill("Sharma Chaat Corner");
  await page.getByTestId("deal-phone").fill("98765 43210");
  check("Deal area pre-filled from area tag", (await page.getByTestId("deal-area").inputValue()) === "Hazratganj, Lucknow");
  await page.screenshot({ path: `${SHOTS}/p2-03-deal.png` });

  // Deal timing: drag the bar's end handle 1s to the left (40px at default zoom).
  const endHandle = page.getByTestId("overlay-handle-end");
  const hb = await endHandle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 40, hb.y + hb.height / 2, { steps: 5 });
  await page.mouse.up();
  const timing = await page.getByTestId("overlay-panel").innerText();
  check("Deal timing trimmed to 0:00 → 0:04", /0:00\.0 → 0:04\.0/.test(timing), timing.match(/\d:\d\d\.\d → \d:\d\d\.\d/)?.[0]);
  await page.getByTestId("overlay-done").click();

  check("4 overlay bars on timeline", (await page.locator('[data-testid^="overlay-bar-"]').count()) === 4);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/p2-04-all.png` });

  // Add one more text, then delete it from the panel.
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-delete").click();
  check("Add + delete overlay", (await page.locator('[data-testid^="overlay-bar-"]').count()) === 4);

  // ── Export ──
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await Promise.race([
    page.getByTestId("export-done").waitFor({ timeout: 120000 }),
    page.getByTestId("export-error").waitFor({ timeout: 120000 }).then(async () => {
      throw new Error(`Export error: ${await page.getByTestId("export-error").innerText()}`);
    }),
  ]);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "export-overlays.mp4");
  await download.saveAs(out);
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", out, "-f", "null", "-"]);
  check("Export decodes cleanly", true);

  const W = 1280, H = 720;
  const exp1 = frameRGB(out, 1.0, W, H);
  const src1 = frameRGB(FIXTURE, 1.0, W, H);
  // Deal card (centre x=0.5, y=0.8) is ~576px wide: x 352..928.
  const cardEdge = px(exp1, W, 365, Math.round(H * 0.8));
  check("Deal banner burned in (red card)", cardEdge[0] > 140 && cardEdge[1] < 90 && cardEdge[2] < 90, `rgb(${cardEdge})`);
  check("Area tag burned in (top centre changed)", regionDiff(exp1, src1, W, 640, Math.round(H * 0.08), 6) > 40);
  check("Sticker region changed", regionDiff(exp1, src1, W, Math.round(W * 0.75), Math.round(H * 0.3), 10) > 20);
  check("Untouched area stays like source", regionDiff(exp1, src1, W, 100, Math.round(H * 0.8)) < 18);

  // At 4.5s the deal has ended (trimmed to 4s) but the area tag (whole video) remains.
  const exp45 = frameRGB(out, 4.5, W, H);
  const src45 = frameRGB(FIXTURE, 4.5, W, H);
  check("Deal gone after its end time", regionDiff(exp45, src45, W, 365, Math.round(H * 0.8)) < 18);
  check("Area tag still there at 4.5s", regionDiff(exp45, src45, W, 640, Math.round(H * 0.08), 6) > 40);

  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", out, "-frames:v", "1", path.join(SHOTS, "p2-05-export-frame.png")]);
  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message);
  await page.screenshot({ path: `${SHOTS}/zz-p2-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

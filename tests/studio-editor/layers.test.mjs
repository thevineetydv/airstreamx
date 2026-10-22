// tests/studio-editor/layers.test.mjs
//
// Phase 6b check: layers (picture-in-picture video + picture) and keyframes.
// Main clip = solid RED, video layer = solid GREEN (its sound is a higher tone),
// picture layer = solid BLUE, so colours and sound can be measured in the export.
//   - video layer shows in preview and export at its place; its sound is mixed in
//   - text keyframes: moves from centre to the right over 2 s (export positions)
//   - picture opacity keyframes: blue at 0 s, gone (green shows) at 2 s, mixed at 1 s
//   - layer timing handle, order, undo, draft save + reopen with layers + keyframes
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/layers.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execFileSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const RED = path.join(here, "fixtures", "red-3s.webm");
const GREEN = path.join(here, "fixtures", "green-3s.webm");
mkdirSync(SHOTS, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "studio-layers-"));
const BLUE = path.join(tmp, "blue.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x0000ff:s=400x400", "-frames:v", "1", BLUE]);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const W = 1280, H = 720;
function frame(file, t) {
  return execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
}
const px = (buf, x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
/** Mean x of near-white pixels in a horizontal band (where the white text is). */
function whiteCentroid(buf, y0, y1) {
  let sx = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = 0; x < W; x += 2) {
    const [r, g, b] = px(buf, x, y);
    if (r > 200 && g > 200 && b > 200) { sx += x; n++; }
  }
  return n ? sx / n : -1;
}
function highDb(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "highpass=f=700,volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  return Number(r.stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -120);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const scrollTo = async (s) => {
  await page.getByTestId("timeline-scroll").evaluate((el, x) => { el.scrollLeft = x * 40; }, s);
  await page.waitForTimeout(350);
};
let n = 0;
async function exportMp4() {
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, `layers-${++n}.mp4`);
  await dl.saveAs(out);
  await page.getByText("Close").click();
  return out;
}

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("file-input").setInputFiles([RED]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  // New projects start 9:16 (Phase 9). This test checks the landscape (Auto) canvas.
  await page.getByTestId("open-aspect").click();
  await page.getByTestId("aspect-auto").click();
  await page.getByTestId("aspect-done").click();

  // ── Video layer ──
  await page.getByTestId("layer-input").setInputFiles([GREEN]);
  await page.getByTestId("layer-panel").waitFor({ timeout: 30000 });
  check("Video layer added + selected", (await page.getByTestId("layer-bar-video").count()) === 1);
  check("Video layer shown in preview", await page.locator('[data-testid="preview-layer"]').first().isVisible());

  // ── Text with keyframes: centre at 0 s → right at 2 s ──
  await page.getByTestId("layer-done").click();
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-text").fill("MOVE");
  // move it to the lower half so it doesn't overlap the layer
  const canvas = await page.getByTestId("overlay-canvas").boundingBox();
  const drag = async (fx, fy, dx, dy) => {
    await page.mouse.move(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * fx + dx / 2, canvas.y + canvas.height * fy + dy / 2, { steps: 3 });
    await page.mouse.move(canvas.x + canvas.width * fx + dx, canvas.y + canvas.height * fy + dy, { steps: 3 });
    await page.mouse.up();
  };
  await drag(0.5, 0.5, 0, canvas.height * 0.25); // to y = 0.75, no keyframes yet -> base value
  await page.getByTestId("key-toggle").click(); // keyframe at 0 s
  check("Keyframe added at 0 s", (await page.getByTestId("key-count").innerText()).startsWith("1"));
  await page.getByTestId("key-auto").click(); // Auto keyframe ON (off by default since Phase 7)
  await scrollTo(2);
  await page.getByTestId("overlay-bar-text").click();
  await drag(0.5, 0.75, canvas.width * 0.3, 0); // at 2 s: drag right -> auto keyframe
  check("Moving at 2 s adds a 2nd keyframe", (await page.getByTestId("key-count").innerText()).startsWith("2"));
  check("Keyframe markers on the bar", (await page.getByTestId("keyframe-marker").count()) === 2);
  await scrollTo(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/p6b-01-text-keyframes.png` });
  await page.getByTestId("overlay-done").click();

  // ── Picture layer with opacity keyframes: 1 at 0 s → 0 at 2 s ──
  await scrollTo(0);
  await page.getByTestId("layer-input").setInputFiles([BLUE]);
  await page.getByTestId("layer-panel").waitFor();
  check("Picture layer added", (await page.getByTestId("layer-bar-image").count()) === 1);
  await page.getByTestId("key-toggle").click();
  await scrollTo(2);
  await page.getByTestId("layer-bar-image").click();
  await page.getByTestId("anim-opacity").fill("0");
  check("Opacity change at 2 s adds a keyframe", (await page.getByTestId("key-count").innerText()).startsWith("2"));
  await scrollTo(1);
  await page.screenshot({ path: `${SHOTS}/p6b-02-layers.png` });

  // Layer timing handle: shorten the picture by 0.5 s (20 px).
  const end = await page.getByTestId("layer-handle-end").boundingBox();
  const before = await page.getByTestId("layer-panel").innerText();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2 - 20, end.y + end.height / 2, { steps: 4 });
  await page.mouse.up();
  const after = await page.getByTestId("layer-panel").innerText();
  check("Layer end handle shortens it", /→ 0:03\.0/.test(before) && /→ 0:02\.5/.test(after), `${before.match(/0:0\d\.\d → 0:0\d\.\d/)?.[0]} → ${after.match(/0:0\d\.\d → 0:0\d\.\d/)?.[0]}`);
  await page.getByTestId("undo").click();
  check("Undo restores the layer length", /→ 0:03\.0/.test(await page.getByTestId("layer-panel").innerText()));
  await page.getByTestId("layer-done").click();

  // ── Export 1 ──
  const out = await exportMp4();
  const f0 = frame(out, 0.05), f1 = frame(out, 1.0), f2 = frame(out, 2.0);
  // Layers sit at x=0.72, y=0.3. Picture (blue, on top) fades out; green video below.
  const lx = W * 0.72, ly = H * 0.3;
  const c0 = px(f0, lx, ly), c1 = px(f1, lx, ly), c2 = px(f2, lx, ly);
  check("Picture layer on top at 0 s (blue)", c0[2] > 180 && c0[1] < 80, `rgb(${c0})`);
  check("Half faded at 1 s (blue + green mix)", c1[2] > 60 && c1[1] > 60, `rgb(${c1})`);
  check("Gone at 2 s → video layer (green)", c2[1] > 150 && c2[2] < 60 && c2[0] < 80, `rgb(${c2})`);
  const main = px(f2, W * 0.15, H * 0.15);
  check("Main clip still red around it", main[0] > 180 && main[1] < 60, `rgb(${main})`);
  const x0 = whiteCentroid(f0, H * 0.7, H * 0.8), x1 = whiteCentroid(f1, H * 0.7, H * 0.8), x2 = whiteCentroid(f2, H * 0.7, H * 0.8);
  check("Text keyframes: centre → right", Math.abs(x0 - W * 0.5) < 40 && x2 > x0 + W * 0.2 && x1 > x0 + 20 && x1 < x2 - 20, `x ${x0.toFixed(0)} → ${x1.toFixed(0)} → ${x2.toFixed(0)}`);
  const withLayerSound = highDb(out);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", out, "-frames:v", "1", path.join(SHOTS, "p6b-03-export-1s.png")]);

  // ── Layer sound: volume 0 → the green layer's high tone disappears ──
  await page.getByTestId("layer-bar-video").click();
  await page.getByTestId("layer-volume").fill("0");
  await page.getByTestId("layer-done").click();
  const out2 = await exportMp4();
  const withoutLayerSound = highDb(out2);
  check("Video layer sound is mixed in", withLayerSound - withoutLayerSound > 6, `${withLayerSound} dB vs ${withoutLayerSound} dB (high tone)`);

  // ── Draft: reopen with layers + keyframes ──
  await page.waitForSelector('[data-testid="save-status"][data-status="saved"]', { timeout: 20000 });
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("draft-item").waitFor({ timeout: 20000 });
  await page.getByTestId("draft-item").locator("button").first().click();
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  check("Draft: both layers restored", (await page.getByTestId("layer-bar-video").count()) === 1 && (await page.getByTestId("layer-bar-image").count()) === 1);
  check("Draft: keyframes restored", (await page.getByTestId("keyframe-marker").count()) === 4);
  await page.screenshot({ path: `${SHOTS}/p6b-04-reopened.png` });

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p6b-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

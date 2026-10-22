// tests/studio-editor/animations.test.mjs
//
// Phase 7 check: ready-made animations + keyframe fixes.
// Main clip = solid RED (3 s), white text, BLUE picture layer, so the effect of
// each animation can be measured in the exported MP4.
//   - text In "Pop" + Out "Fade": small/faint at start, full in the middle, faint at the end
//   - text In "Typewriter": about half the letters at half the In time, revealed left → right
//   - picture Loop "Float": moves up and down
//   - choosing an animation plays a preview
//   - Auto keyframe OFF (default): dragging between keyframes moves the whole
//     animation, no new keyframe; ON: adds one; "Clear all" removes them
//   - desktop: panels are a centred column, not full width
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/animations.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const RED = path.join(here, "fixtures", "red-3s.webm");
mkdirSync(SHOTS, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "studio-anim-"));
const BLUE = path.join(tmp, "blue.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x0000ff:s=300x300", "-frames:v", "1", BLUE]);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const W = 1280, H = 720;
const frame = (file, t) =>
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
/** Count + centroid of pixels matching `test` inside a box. */
function blob(buf, test, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  let n = 0, sx = 0, sy = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * W + x) * 3;
    if (test(buf[i], buf[i + 1], buf[i + 2])) { n++; sx += x; sy += y; }
  }
  return { n, x: n ? sx / n : -1, y: n ? sy / n : -1 };
}
const white = (r, g, b) => r > 200 && g > 200 && b > 200;
const blue = (r, g, b) => b > 180 && r < 80 && g < 80;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const scrollTo = async (s) => {
  await page.getByTestId("timeline-scroll").evaluate((el, x) => { el.scrollLeft = x * 40; }, s);
  await page.waitForTimeout(350);
};
const label = () => page.getByTestId("time-label").innerText();
let n = 0;
async function exportMp4() {
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, `anim-${++n}.mp4`);
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

  // ── Text: Pop in, Fade out ──
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-text").fill("HELLO LUCKNOW");
  await page.getByTestId("anim-in-pop").click();
  await page.waitForTimeout(400);
  const t1 = await label();
  check("Choosing an animation plays a preview", !t1.startsWith("0:00.0"), t1);
  await page.waitForTimeout(1200);
  await page.getByTestId("anim-tab-out").click();
  await page.getByTestId("anim-out-fade").click();
  await page.waitForTimeout(1300);
  await scrollTo(0.2);
  await page.screenshot({ path: `${SHOTS}/p7-01-pop.png` });
  await page.getByTestId("overlay-done").click();

  // ── Picture: Loop float ──
  await scrollTo(0);
  await page.getByTestId("layer-input").setInputFiles([BLUE]);
  await page.getByTestId("layer-panel").waitFor();
  await page.getByTestId("anim-tab-loop").click();
  await page.getByTestId("anim-loop-float").click();
  await page.waitForTimeout(2700);
  await page.getByTestId("layer-done").click();

  const out = await exportMp4();
  const box = [Math.round(W * 0.2), Math.round(H * 0.4), Math.round(W * 0.8), Math.round(H * 0.6)];
  const a = blob(frame(out, 0.05), white, ...box).n;
  const b = blob(frame(out, 1.5), white, ...box).n;
  const c = blob(frame(out, 2.95), white, ...box).n;
  check("Pop: text small/faint at the start", a < b * 0.4, `${a} vs ${b} white px`);
  check("Fade out: faint at the end", c < b * 0.4, `${c} vs ${b} white px`);
  // Bottom edge of the picture (its top is outside the frame, so the centre would hide the motion).
  const bottom = (buf) => { for (let y = H - 1; y > 0; y--) { const i = (y * W + Math.round(W * 0.72)) * 3; if (blue(buf[i], buf[i + 1], buf[i + 2])) return y; } return -1; };
  const low = bottom(frame(out, 0.31)), high = bottom(frame(out, 0.94));
  check("Float: picture moves up and down", low - high > 20, `bottom edge y ${low} vs ${high}`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.1", "-i", out, "-frames:v", "1", path.join(SHOTS, "p7-02-pop-start.png")]);

  // ── Typewriter ──
  await page.getByTestId("overlay-bar-text").click();
  await page.getByTestId("anim-tab-in").click();
  await page.getByTestId("anim-in-typewriter").click();
  await page.getByTestId("anim-in-duration").fill("1.4");
  await page.waitForTimeout(2200);
  await page.getByTestId("overlay-done").click();
  const out2 = await exportMp4();
  const half = blob(frame(out2, 0.7), white, ...box), full = blob(frame(out2, 1.5), white, ...box);
  check("Typewriter: about half the letters halfway", half.n > full.n * 0.25 && half.n < full.n * 0.75, `${half.n} of ${full.n}`);
  check("Typewriter: revealed from the left", half.x < full.x - 30, `x ${half.x.toFixed(0)} vs ${full.x.toFixed(0)}`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.7", "-i", out2, "-frames:v", "1", path.join(SHOTS, "p7-03-typewriter.png")]);

  // ── Auto keyframe OFF / ON, Clear ──
  await scrollTo(0.5);
  await page.getByTestId("overlay-bar-text").click();
  check("Auto keyframe is OFF by default", (await page.getByTestId("key-auto").getAttribute("data-on")) === "false");
  await page.getByTestId("key-toggle").click();
  await scrollTo(1.8);
  await page.getByTestId("overlay-bar-text").click();
  await page.getByTestId("anim-scale").fill("1.6");
  check("OFF: resizing between keyframes adds none", (await page.getByTestId("key-count").innerText()).startsWith("1"));
  await page.getByTestId("key-auto").click();
  await page.getByTestId("anim-scale").fill("2");
  check("ON: resizing adds a keyframe", (await page.getByTestId("key-count").innerText()).startsWith("2"));
  await page.getByTestId("key-clear").click();
  check("Clear all removes keyframes", (await page.getByTestId("key-count").innerText()).startsWith("0"));
  await page.screenshot({ path: `${SHOTS}/p7-04-keyframe-controls.png` });
  await page.getByTestId("undo").click();
  check("Undo brings them back", (await page.getByTestId("key-count").innerText()).startsWith("2"));

  // ── Desktop layout ──
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(400);
  const col = await page.getByTestId("panel-column").boundingBox();
  check("Desktop: panels in a centred column", col.width <= 680 && Math.abs(col.x + col.width / 2 - 800) < 20, `${col.width.toFixed(0)} px wide`);
  await page.screenshot({ path: `${SHOTS}/p7-05-desktop.png` });

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p7-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

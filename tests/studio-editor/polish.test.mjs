// tests/studio-editor/polish.test.mjs
//
// Phase 9 check: creator polish.
//   - Start screen: template card first, no "Failed to load videos" toast
//   - New project is 9:16; landscape clips get a blurred background (no black bars)
//   - Long-press + drag a clip to reorder (a quick swipe does not); one Undo
//   - New text: typing replaces "Your text"; Hindi font is used in the export
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/polish.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const RED = path.join(here, "fixtures", "red-3s.webm");
const GREEN = path.join(here, "fixtures", "green-3s.webm");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const W = 720, H = 1280;
const frame = (file, t) =>
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
const px = (buf, x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
function whiteCount(buf, y0, y1) {
  let n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = 0; x < W; x += 2) { const [r, g, b] = px(buf, x, y); if (r > 220 && g > 220 && b > 220) n++; }
  return n;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
// These checks use style / font / animation / keyframe controls, which live
// under "More options" + Pro mode since Phase 12: open both for the test.
await context.addInitScript(() => localStorage.setItem("studio-editor-prefs", JSON.stringify({ more: true, pro: true })));
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const firstThumb = (i) => page.getByTestId(`clip-${i}`).locator("img").first().getAttribute("src");

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000); // the feed request fails here (no backend) — toast must stay hidden
  const tpl = await page.getByTestId("start-template").boundingBox();
  const imp = await page.getByTestId("import-empty").boundingBox();
  check("Template card comes first on the start screen", tpl.y < imp.y && tpl.height > 80, `template y ${tpl.y.toFixed(0)}, import y ${imp.y.toFixed(0)}`);
  check("No feed error toast inside the editor", !(await page.getByText("Failed to load videos").isVisible()));
  await page.screenshot({ path: `${SHOTS}/p9-01-start.png` });

  await page.getByTestId("file-input").setInputFiles([RED, GREEN]);
  await page.getByTestId("clip-1").waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  check("New project starts 9:16", (await page.getByTestId("open-aspect").innerText()).includes("9:16"));
  check("Blurred background in preview (landscape clip)", await page.getByTestId("preview-blur-bg").isVisible());

  // ── Reorder ──
  const redSrc = await firstThumb(0), greenSrc = await firstThumb(1);
  await page.getByTestId("zoom-out").click().catch(() => {});
  const c0 = await page.getByTestId("clip-0").boundingBox();
  const c1 = await page.getByTestId("clip-1").boundingBox();
  // Quick swipe: no hold → no reorder.
  await page.mouse.move(c0.x + c0.width / 2, c0.y + c0.height / 2);
  await page.mouse.down();
  await page.mouse.move(c1.x + c1.width * 0.8, c0.y + c0.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check("Quick swipe does not move the clip", (await firstThumb(0)) === redSrc);
  // Long-press, then drag past the middle of the 2nd clip.
  const a = await page.getByTestId("clip-0").boundingBox();
  const b = await page.getByTestId("clip-1").boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(550);
  check("Long-press picks the clip up", (await page.locator('[data-dragging="true"]').count()) === 1);
  await page.mouse.move(b.x + b.width * 0.8, a.y + a.height / 2, { steps: 6 });
  await page.screenshot({ path: `${SHOTS}/p9-02-dragging.png` });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check("Drag moves the red clip after the green one", (await firstThumb(0)) === greenSrc && (await firstThumb(1)) === redSrc);
  await page.getByTestId("undo").click();
  check("Undo puts it back", (await firstThumb(0)) === redSrc);
  await page.getByTestId("redo").click();
  check("Redo moves it again", (await firstThumb(0)) === greenSrc);

  // Same with a real finger (touch events): the timeline must not scroll while dragging.
  const cdp = await context.newCDPSession(page);
  const t0 = await page.getByTestId("clip-0").boundingBox();
  const t1 = await page.getByTestId("clip-1").boundingBox();
  const y = t0.y + t0.height / 2;
  const scrollBefore = await page.getByTestId("timeline-scroll").evaluate((el) => el.scrollLeft);
  const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", t0.x + t0.width / 2);
  await page.waitForTimeout(550);
  for (let k = 1; k <= 8; k++) { await touch("touchMove", t0.x + t0.width / 2 + ((t1.x + t1.width * 0.8 - t0.x - t0.width / 2) * k) / 8); await page.waitForTimeout(30); }
  await touch("touchEnd");
  await page.waitForTimeout(300);
  const scrollAfter = await page.getByTestId("timeline-scroll").evaluate((el) => el.scrollLeft);
  check("Touch: long-press drag reorders", (await firstThumb(0)) === redSrc, `scroll ${scrollBefore} → ${scrollAfter}`);
  check("Touch: timeline did not scroll while dragging", Math.abs(scrollAfter - scrollBefore) < 5);
  await page.getByTestId("undo").click(); // back to green first for the export checks

  // ── Text: typing replaces the default, Hindi font ──
  await page.getByTestId("tool-deselect").click(); // the moved clip stays selected
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 0; });
  await page.getByTestId("tool-text").click();
  const focused = await page.getByTestId("overlay-text").evaluate((el) => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length);
  check("New text is focused with 'Your text' selected", focused);
  await page.keyboard.type("नमस्ते LKO");
  check("Typing replaces 'Your text'", (await page.getByTestId("overlay-text").inputValue()) === "नमस्ते LKO");
  await page.getByTestId("font-hindi").click();
  await page.waitForTimeout(800);
  check("Hindi font downloaded (Latin + Devanagari)", await page.evaluate(() => document.fonts.check('800 40px "Mukta"', "अA")));
  await page.screenshot({ path: `${SHOTS}/p9-03-hindi-font.png` });
  await page.getByTestId("overlay-done").click();

  // ── Export ──
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "polish-1.mp4");
  await dl.saveAs(out);
  await page.getByText("Close").click();
  const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { encoding: "utf8" }).trim();
  check("Export is 720×1280", probe === "720,1280", probe);
  const f = frame(out, 0.5);
  const mid = px(f, W / 2, H * 0.62), top = px(f, W / 2, H * 0.08);
  check("Green clip plays first (reordered)", mid[1] > 180 && mid[0] < 80, `rgb(${mid})`);
  check("Blurred background, not black bars", top[1] > 40 && top[1] < 200 && top[0] < 60, `rgb(${top})`);
  check("Text burned in", whiteCount(f, H * 0.4, H * 0.6) > 150, `${whiteCount(f, H * 0.4, H * 0.6)} white px`);
  const f2 = frame(out, 4.5);
  const mid2 = px(f2, W / 2, H * 0.62);
  check("Red clip second", mid2[0] > 180 && mid2[1] < 80, `rgb(${mid2})`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.5", "-i", out, "-frames:v", "1", path.join(SHOTS, "p9-04-export.png")]);

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p9-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

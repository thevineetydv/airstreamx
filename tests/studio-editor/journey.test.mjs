// tests/studio-editor/journey.test.mjs
//
// END-TO-END: one creator makes one real video, start to upload, on a small
// Android-size screen (360×640) with the CPU slowed down 2× (mid/low phone).
// Every step checks that the screen never scrolls and Export stays visible.
//
//   0. Site home does NOT download the editor code (lazy route)
//   1. Template "Food review" → form → 4 videos picked
//   2. Edit: split + delete, speed 2×, filter, drag-reorder, transition
//   3. Add: Hindi text with a quick style, sticker, Deal (via More)
//   4. Green-screen video layer, brand logo
//   5. Music beat sync, voice-over (fake mic)
//   6. Undo / redo
//   7. Auto-save → reload → reopen draft → everything back
//   8. Export 720p → file checks (size, length, sound, clean decode, logo,
//      no green left) → hand to the Upload form
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/journey.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, statSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const F = (n) => path.join(here, "fixtures", n);
mkdirSync(SHOTS, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "studio-journey-"));
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const GS = path.join(tmp, "greenscreen.webm");
ff("-f", "lavfi", "-i", "color=c=0x00b140:s=480x480:d=3:r=30", "-vf", "drawbox=x=160:y=160:w=160:h=160:color=white:t=fill", "-c:v", "libvpx-vp9", "-b:v", "1M", GS);
const LOGO = path.join(tmp, "logo.png");
ff("-f", "lavfi", "-i", "color=c=0x1d4ed8:s=200x200", "-frames:v", "1", LOGO);
const MIC = path.join(tmp, "voice.wav");
ff("-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*(220+80*sin(2*PI*0.7*t))*t)':s=48000:d=30", "-ac", "1", MIC);

const results = [];
const timings = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
let t0 = Date.now();
const lap = (what) => { const ms = Date.now() - t0; timings.push(`${what}: ${(ms / 1000).toFixed(1)} s`); t0 = Date.now(); return ms; };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}`],
});
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
await context.grantPermissions(["microphone"]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2 });

const label = () => page.getByTestId("time-label").innerText();
const totalSec = async () => { const [m, s] = (await label()).split("/")[1].trim().split(":"); return Number(m) * 60 + Number(s); };
const clipCount = () => page.locator("[data-clip-block]").count();
let layoutBad = [];
/** Screen must not scroll and Export must stay visible at every step. */
async function screenOk(step) {
  const r = await page.evaluate(() => {
    const exp = document.querySelector('[data-testid="open-export"]')?.getBoundingClientRect();
    const scrolled = [document.documentElement, document.body, ...document.querySelectorAll("main, section")].some((e) => e.scrollTop > 0) || scrollY > 0;
    return { scrolled, exportTop: exp ? exp.top : 0 };
  });
  if (r.scrolled || r.exportTop < 0) layoutBad.push(step);
}
let shot = 0;
const snap = async (name) => { await screenOk(name); await page.screenshot({ path: `${SHOTS}/e2e-${String(++shot).padStart(2, "0")}-${name}.png` }); };
const scrollTo = async (s) => { await page.getByTestId("timeline-scroll").evaluate((el, x) => { el.scrollLeft = x * 40; }, s); await page.waitForTimeout(300); };

try {
  // ── 0. Lazy route: home page must not load the editor ──
  const editorChunks = [];
  page.on("request", (r) => { if (/StudioEditorPage|mediabunny/i.test(r.url())) editorChunks.push(r.url()); });
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("0. Home page does not download the editor code", editorChunks.length === 0, editorChunks.join(", "));

  // ── 1. Template start ──
  t0 = Date.now();
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-template").waitFor({ timeout: 20000 });
  check("1. Editor opens", true, `${lap("Editor open")} ms`);
  await snap("start");
  await page.getByTestId("start-template").click();
  await page.getByTestId("template-food-review").click();
  await page.getByTestId("template-field-dish").fill("Tokri Chaat");
  await page.getByTestId("template-field-place").fill("Royal Cafe");
  await page.getByTestId("template-field-area").fill("Hazratganj");
  await page.getByTestId("template-rating-5").click();
  await page.getByTestId("template-field-price").fill("₹90");
  await snap("template-form");
  t0 = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("template-apply").click()]);
  await chooser.setFiles([F("landscape-6s.webm"), F("red-3s.webm"), F("green-3s.webm"), F("portrait-4s-noaudio.webm")]);
  await page.getByTestId("clip-3").waitFor({ timeout: 60000 });
  await page.getByTestId("beat-marker").first().waitFor({ timeout: 20000 });
  lap("Import 4 videos + template + beat sync");
  check("1. Template applied: 9:16, Chai Break music, beat marks", (await page.getByTestId("open-aspect").innerText()).includes("9:16") && (await page.getByTestId("audio-bar-music").innerText()).includes("Chai Break") && (await page.locator('[data-testid="beat-marker"]').count()) > 5);
  check("1. Template text on the timeline", (await page.locator('[data-testid="overlay-bar-text"]').count()) >= 3);
  await snap("template-applied");

  // ── 2. Clip edits ──
  const before = await totalSec();
  await scrollTo(2);
  await page.getByTestId("clip-0").click();
  await page.getByTestId("tool-split").click();
  check("2. Split → 5 clips", (await clipCount()) === 5);
  await page.getByTestId("tool-delete").click();
  check("2. Delete → 4 clips, shorter video", (await clipCount()) === 4 && (await totalSec()) < before, `${before} → ${await totalSec()} s`);
  await page.getByTestId("clip-1").click();
  await page.getByTestId("tool-speed").click();
  await page.getByTestId("speed-2").click();
  await page.getByTestId("clip-done").click();
  await page.getByTestId("clip-2").click();
  await page.getByTestId("tool-filters").click();
  await page.getByTestId("filter-bw").click();
  await snap("filters");
  await page.getByTestId("clip-done").click();
  await page.getByTestId("tool-deselect").click().catch(() => {});
  // Drag clip 0 after clip 1 (long-press).
  const thumb = (i) => page.getByTestId(`clip-${i}`).locator("img").first().getAttribute("src");
  const firstBefore = await thumb(0);
  await scrollTo(0);
  const a = await page.getByTestId("clip-0").boundingBox(), b = await page.getByTestId("clip-1").boundingBox();
  await page.mouse.move(a.x + Math.min(a.width / 2, 30), a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(b.x + b.width * 0.85, a.y + a.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check("2. Long-press drag reorders clips", (await thumb(1)) === firstBefore);
  await page.getByTestId("tool-deselect").click().catch(() => {});
  await page.getByTestId("transition-btn-0").click();
  await page.getByTestId("transition-fade").click();
  await page.getByTestId("transition-done").click();
  check("2. Fade transition on the first cut", (await page.getByTestId("transition-btn-0").innerText()).includes("⧓"));

  // ── 3. Text / sticker / deal ──
  await scrollTo(1);
  await page.getByTestId("tool-text").click();
  await page.keyboard.type("स्वाद ज़बरदस्त!");
  await page.getByTestId("title-hindi").click();
  check("3. Hindi text typed over 'Your text'", (await page.getByTestId("overlay-text").inputValue()) === "स्वाद ज़बरदस्त!");
  await snap("text");
  await page.getByTestId("overlay-done").click();
  await page.getByTestId("tool-sticker").click();
  await page.getByTestId("overlay-done").click();
  await page.getByTestId("tool-more").click();
  await page.getByTestId("tool-deal").click();
  await page.getByTestId("deal-offer").fill("10% OFF");
  await page.getByTestId("deal-business").fill("Royal Cafe");
  check("3. Deal area pre-filled from the template", (await page.getByTestId("deal-area").inputValue()) === "Hazratganj");
  await snap("deal");
  await page.getByTestId("overlay-done").click();

  // ── 4. Green screen layer + logo ──
  await scrollTo(0);
  await page.getByTestId("layer-input").setInputFiles([GS]);
  await page.getByTestId("layer-panel").waitFor({ timeout: 30000 });
  await page.getByTestId("chroma-green").click();
  await page.waitForTimeout(500);
  check("4. Green screen keyed in preview", await page.getByTestId("preview-layer-keyed").isVisible());
  await snap("green-screen");
  await page.getByTestId("layer-done").click();
  await page.getByTestId("tool-more").click();
  await page.getByTestId("tool-brand").click();
  await page.getByTestId("brand-logo-input").setInputFiles([LOGO]);
  await page.getByTestId("brand-logo-preview").waitFor();
  await page.getByTestId("brand-add-logo").click();
  await page.getByTestId("layer-done").click();
  check("4. Logo layer added", (await page.locator('[data-testid="layer-bar-image"]').count()) === 1);

  // ── 5. Music + voice-over ──
  await page.getByTestId("tool-audio").click();
  check("5. Music synced (status)", /Synced/.test(await page.getByTestId("beat-sync-status").innerText()));
  await scrollTo(1);
  await page.getByTestId("audio-record").click();
  await page.getByTestId("audio-stop-record").waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId("audio-stop-record").click();
  await page.getByTestId("audio-voice-item").waitFor({ timeout: 10000 });
  check("5. Voice-over recorded", (await page.getByTestId("audio-bar-voice").count()) === 1);
  await snap("audio");
  await page.getByTestId("audio-done").click();

  // ── 6. Undo / redo ──
  const n = await page.locator('[data-testid^="overlay-bar-"]').count();
  await page.getByTestId("undo").click();
  await page.getByTestId("redo").click();
  check("6. Undo + redo leaves the edit unchanged", (await page.locator('[data-testid^="overlay-bar-"]').count()) === n && (await page.getByTestId("audio-bar-voice").count()) === 1);

  // ── 7. Draft: reload and reopen ──
  const finalTotal = await label();
  const counts = async () => ({
    clips: await clipCount(),
    overlays: await page.locator('[data-testid^="overlay-bar-"]').count(),
    layers: await page.locator('[data-testid^="layer-bar-"]').count(),
    voice: await page.getByTestId("audio-bar-voice").count(),
    music: await page.getByTestId("audio-bar-music").count(),
  });
  const want = await counts();
  await page.waitForSelector('[data-testid="save-status"][data-status="saved"]', { timeout: 30000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("draft-item").first().waitFor({ timeout: 20000 });
  t0 = Date.now();
  await page.getByTestId("draft-item").first().locator("button").first().click();
  await page.getByTestId("clip-0").waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  lap("Reopen draft");
  const got = await counts();
  check("7. Draft reopened with everything", JSON.stringify(got) === JSON.stringify(want) && (await label()).split("/")[1] === finalTotal.split("/")[1], `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
  await snap("reopened");

  // ── 8. Export + upload ──
  await page.getByTestId("open-export").click();
  t0 = Date.now();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 600000 });
  const exportMs = lap("Export 720p");
  const info = await page.getByTestId("export-done").innerText();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "journey.mp4");
  await dl.saveAs(out);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", out], { encoding: "utf8" }));
  const v = probe.streams.find((s) => s.codec_type === "video");
  const hasAudio = probe.streams.some((s) => s.codec_type === "audio");
  const dur = Number(probe.format.duration);
  const tl = await totalSec();
  check("8. Export: 720×1280 with sound", v?.width === 720 && v?.height === 1280 && hasAudio, `${v?.width}×${v?.height}, audio ${hasAudio}`);
  check("8. Export length = timeline length", Math.abs(dur - tl) < 0.2, `${dur.toFixed(2)} s vs ${tl} s`);
  let clean = true;
  try { execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", out, "-f", "null", "-"]); } catch { clean = false; }
  check("8. Export decodes cleanly (no broken frames)", clean, `${(statSync(out).size / 1048576).toFixed(1)} MB · ${info.split("\n")[0]}`);
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
  const px = (x, y) => { const i = (Math.round(y) * 720 + Math.round(x)) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
  const logo = px(720 * 0.86, 1280 * 0.08);
  check("8. Logo top-right in the video", logo[2] > 150 && logo[0] < 90, `rgb(${logo})`);
  let green = 0;
  for (let i = 0; i < raw.length; i += 3 * 7) if (raw[i + 1] > 150 && raw[i] < 60 && raw[i + 2] < 100 && raw[i + 1] - raw[i + 2] > 80) green++;
  check("8. No studio-green left from the green screen", green < 400, `${green} px`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", out, "-frames:v", "1", path.join(SHOTS, "e2e-90-export-frame.png")]);
  await page.getByTestId("upload-export").click();
  const uploadOpen = await page.getByText(/Studio edit - .*\.mp4/).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check("8. Upload form opens with the exported video", uploadOpen);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/e2e-91-upload.png` });
  check(`8. Export time on a 2× slower CPU`, exportMs < 6 * 60000, `${(exportMs / 1000).toFixed(0)} s for ${tl} s of video`);

  check("Screen never scrolled / Export always visible", layoutBad.length === 0, layoutBad.join(", "));
  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Journey run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-e2e-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\nTimings (2× slower CPU):\n  " + timings.join("\n  "));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

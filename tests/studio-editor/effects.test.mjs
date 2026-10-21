// tests/studio-editor/effects.test.mjs
//
// Phase 5 check: speed, transitions, filters, crop/fit, canvas shape.
// Uses a solid RED clip (300 Hz tone) and a solid GREEN clip (800 Hz tone),
// so mixes and filters can be measured exactly from exported pixels.
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/effects.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { execFileSync, spawnSync } from "child_process";
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

const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString());
/** Average RGB of a small box at (x, y) in the frame at time t. */
function rgbAt(file, t, x, y, w, h) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
    const i = (yy * w + xx) * 3;
    r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
function meanDb(file, t0, t1) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(t0), "-t", String(t1 - t0), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/mean_volume: (-?[\d.]+) dB/);
  return m ? Number(m[1]) : -120;
}
const timeOf = (label) => {
  const m = label.split("/")[1].trim().match(/(\d+):(\d+)\.(\d)/);
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

let n = 0;
async function exportMp4(res = "720p") {
  await page.getByTestId("open-export").click();
  await page.getByTestId(`res-${res}`).click();
  await page.getByTestId("start-export").click();
  await Promise.race([
    page.getByTestId("export-done").waitFor({ timeout: 120000 }),
    page.getByTestId("export-error").waitFor({ timeout: 120000 }).then(async () => {
      throw new Error(`Export error: ${await page.getByTestId("export-error").innerText()}`);
    }),
  ]);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, `effects-${++n}.mp4`);
  await dl.saveAs(out);
  await page.getByText("Close").click();
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", out, "-f", "null", "-"]);
  return out;
}

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("file-input").setInputFiles([RED, GREEN]);
  await page.getByTestId("clip-1").waitFor({ timeout: 30000 });
  const label = page.getByTestId("time-label");

  // ── Speed 2× on the red clip ──
  await page.getByTestId("clip-0").click();
  await page.getByTestId("tool-speed").click();
  await page.getByTestId("speed-2").click();
  check("Speed 2× halves the red clip (total 4.5 s)", Math.abs(timeOf(await label.innerText()) - 4.5) < 0.15, await label.innerText());
  check("2× badge on the clip", (await page.getByTestId("clip-speed-0").innerText()) === "2×");
  await page.screenshot({ path: `${SHOTS}/p5-01-speed.png` });
  await page.getByTestId("clip-done").click();
  await page.getByTestId("tool-deselect").click(); // transition buttons hide next to a selected clip

  // ── Fade transition, 1 s, on the cut ──
  await page.getByTestId("transition-btn-0").click();
  await page.getByTestId("transition-fade").click();
  await page.getByTestId("transition-length").fill("1");
  check("Length unchanged by transition", Math.abs(timeOf(await label.innerText()) - 4.5) < 0.15);
  await page.waitForTimeout(800);
  // Playhead is parked on the cut -> both preview videos visible, incoming at ~50 %.
  const opac = await page.evaluate(() =>
    [0, 1].map((i) => Number(getComputedStyle(document.querySelector(`[data-testid="preview-video-${i}"]`)).opacity)));
  check("Preview mixes both clips at the cut", opac[0] === 1 && opac[1] > 0.3 && opac[1] < 0.7, `opacity ${opac.map((o) => o.toFixed(2)).join(" / ")}`);
  await page.screenshot({ path: `${SHOTS}/p5-02-transition.png` });
  await page.getByTestId("transition-done").click();

  // Play across the cut in the preview.
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 0; });
  await page.waitForTimeout(300);
  await page.getByTestId("play-toggle").click();
  await page.waitForTimeout(2600);
  const played = timeOf(`x / ${(await label.innerText()).split("/")[0]}`);
  await page.getByTestId("play-toggle").click();
  check("Preview plays through the transition", played > 1.9, `reached ${played}s`);

  const out1 = await exportMp4();
  const p1 = probe(out1);
  const v1 = p1.streams.find((s) => s.codec_type === "video");
  check("Export length 4.5 s", Math.abs(Number(p1.format.duration) - 4.5) < 0.1, `${Number(p1.format.duration).toFixed(2)}s`);
  const W = 1280, H = 720;
  const red = rgbAt(out1, 0.4, 640, 360, W, H);
  const mid = rgbAt(out1, 1.5, 640, 360, W, H);
  const green = rgbAt(out1, 3.5, 640, 360, W, H);
  check("Red before the cut", red[0] > 200 && red[1] < 60, `rgb(${red})`);
  check("Fade = red+green mix at the cut", mid[0] > 80 && mid[0] < 175 && mid[1] > 80 && mid[1] < 175, `rgb(${mid})`);
  check("Green after the cut", green[1] > 200 && green[0] < 60, `rgb(${green})`);
  const cutDb = meanDb(out1, 1.2, 1.8);
  check("No audio gap at the cut (sound cross-fades)", cutDb > -30, `${cutDb} dB`);
  check("Video codec + size", v1.width === 1280 && v1.height === 720, `${v1.codec_name} ${v1.width}x${v1.height}`);

  // ── Filters + crop + square canvas ──
  await page.getByTestId("clip-1").click();
  await page.getByTestId("tool-filters").click();
  await page.getByTestId("filter-bw").click();
  const cssFilter = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="preview-video-1"]')).filter);
  check("Preview shows B&W on the green clip", cssFilter.includes("grayscale"), cssFilter);
  await page.getByTestId("clip-tab-crop").click();
  await page.getByTestId("fit-fill").click();
  await page.screenshot({ path: `${SHOTS}/p5-03-filter-fill.png` });
  await page.getByTestId("clip-done").click();

  await page.getByTestId("clip-0").click();
  await page.getByTestId("tool-crop").click();
  await page.getByTestId("fit-blur").click();
  await page.getByTestId("clip-done").click();

  await page.getByTestId("open-aspect").click();
  await page.getByTestId("aspect-1:1").click();
  const stage = await page.getByTestId("preview-stage").boundingBox();
  check("Preview is square", Math.abs(stage.width - stage.height) < 2, `${stage.width}×${stage.height}`);
  await page.screenshot({ path: `${SHOTS}/p5-04-square.png` });
  await page.getByTestId("aspect-done").click();

  const out2 = await exportMp4();
  const v2 = probe(out2).streams.find((s) => s.codec_type === "video");
  check("Square export 720×720", v2.width === 720 && v2.height === 720, `${v2.width}x${v2.height}`);
  const gray = rgbAt(out2, 3.5, 360, 360, 720, 720);
  check("B&W filter in export (r≈g≈b)", Math.abs(gray[0] - gray[1]) < 12 && Math.abs(gray[1] - gray[2]) < 12 && gray[1] > 100, `rgb(${gray})`);
  const fillTop = rgbAt(out2, 3.5, 360, 30, 720, 720);
  check("Fill: no bars on the green clip", fillTop[1] > 100, `top rgb(${fillTop})`);
  const blurTop = rgbAt(out2, 0.4, 360, 30, 720, 720);
  const centre = rgbAt(out2, 0.4, 360, 360, 720, 720);
  check("Blur bars: top area is blurred red, not black", blurTop[0] > 60 && blurTop[0] < centre[0], `top rgb(${blurTop}) vs centre rgb(${centre})`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.4", "-i", out2, "-frames:v", "1", path.join(SHOTS, "p5-05-square-blur-frame.png")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", out1, "-frames:v", "1", path.join(SHOTS, "p5-06-fade-frame.png")]);

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message);
  await page.screenshot({ path: `${SHOTS}/zz-p5-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

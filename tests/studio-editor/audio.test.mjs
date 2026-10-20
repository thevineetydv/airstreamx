// tests/studio-editor/audio.test.mjs
//
// Phase 3 check: mute original, background music (library), fade-out,
// voice-over recording (fake mic), moving a voice-over, and music ducking.
// Every check exports a real MP4 and measures loudness in time windows with ffmpeg.
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/audio.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execFileSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const FIXTURE = path.join(here, "fixtures", "landscape-6s.webm"); // has a 440 Hz tone
mkdirSync(SHOTS, { recursive: true });

// Speech-like test signal for the fake microphone (wobbling pitch, 4 Hz "syllables").
const tmp = mkdtempSync(path.join(tmpdir(), "studio-audio-"));
const MIC_WAV = path.join(tmp, "voice.wav");
execFileSync("ffmpeg", [
  "-v", "error", "-y", "-f", "lavfi",
  "-i", "aevalsrc='0.5*sin(2*PI*(220+80*sin(2*PI*0.7*t))*t)*(0.55+0.45*sin(2*PI*4*t))':s=48000:d=30",
  "-ac", "1", MIC_WAV,
]);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Run ffmpeg and return its log (stderr). Throws if ffmpeg fails. */
function ffmpegLog(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-300)}`);
  return r.stderr;
}
/** Mean loudness (dB) of the file's audio between t0 and t1. */
function meanDb(file, t0, t1) {
  const log = ffmpegLog(["-ss", String(t0), "-t", String(t1 - t0), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
  const m = log.match(/mean_volume: (-?[\d.]+|-inf) dB/);
  return m && m[1] !== "-inf" ? Number(m[1]) : -120;
}
const execErr = (file) => ffmpegLog(["-v", "error", "-xerror", "-i", file, "-f", "null", "-"]);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${MIC_WAV}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
});
await context.grantPermissions(["microphone"]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

let exportNo = 0;
async function exportMp4() {
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await Promise.race([
    page.getByTestId("export-done").waitFor({ timeout: 120000 }),
    page.getByTestId("export-error").waitFor({ timeout: 120000 }).then(async () => {
      throw new Error(`Export error: ${await page.getByTestId("export-error").innerText()}`);
    }),
  ]);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, `audio-export-${++exportNo}.mp4`);
  await download.saveAs(out);
  await page.getByText("Close").click();
  execErr(out); // throws if the audio cannot be decoded
  return out;
}
const scrollTo = async (seconds) => {
  await page.getByTestId("timeline-scroll").evaluate((el, s) => { el.scrollLeft = s * 40; }, seconds);
  await page.waitForTimeout(300);
};

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("file-input").setInputFiles([FIXTURE]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });

  // 0) Baseline: original 440 Hz tone is in the export.
  const base = await exportMp4();
  const baseDb = meanDb(base, 1, 5);
  check("Original sound exported", baseDb > -30, `${baseDb} dB`);

  // 1) Mute original -> silence.
  await page.getByTestId("tool-audio").click();
  await page.getByTestId("audio-panel").waitFor();
  await page.getByTestId("audio-mute-original").click();
  await page.screenshot({ path: `${SHOTS}/p3-01-audio-panel.png` });
  const muted = await exportMp4();
  const mutedDb = meanDb(muted, 0, 6);
  check("Mute original -> silent audio track", mutedDb < -70, `${mutedDb} dB`);

  // 2) Background music from the library.
  await page.getByTestId("audio-use-bazaar-bounce").click();
  await page.getByTestId("audio-music-volume").fill("1");
  check("Music bar on timeline", (await page.getByTestId("audio-bar-music").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/p3-02-music.png` });
  const withMusic = await exportMp4();
  const musicMid = meanDb(withMusic, 1, 3.5);
  const musicTail = meanDb(withMusic, 5.6, 6.0);
  check("Music in export", musicMid > -30, `${musicMid} dB`);
  check("Music fades out at the end", musicTail < musicMid - 10, `mid ${musicMid} dB, last 0.4s ${musicTail} dB`);

  // 3) Ducking: record a voice-over, set its volume to 0, then the music alone
  //    should be ~10 dB lower while the voice-over "speaks".
  await scrollTo(1);
  await page.getByTestId("audio-record").click();
  await page.getByTestId("audio-stop-record").waitFor({ timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/p3-03-recording.png` });
  await page.getByTestId("audio-stop-record").click();
  await page.getByTestId("audio-voice-item").waitFor({ timeout: 10000 });
  const voText = await page.getByTestId("audio-voice-item").innerText();
  const [, s, e] = voText.match(/(\d:\d\d\.\d) → (\d:\d\d\.\d)/) ?? [];
  const toSec = (x) => Number(x.split(":")[0]) * 60 + Number(x.split(":")[1]);
  const voStart = toSec(s), voEnd = toSec(e);
  check("Voice-over recorded from 0:01", Math.abs(voStart - 1) < 0.15 && voEnd - voStart > 1.5, `${s} → ${e}`);
  check("Voice-over bar on timeline", (await page.getByTestId("audio-bar-voice").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/p3-04-voice.png` });

  await page.getByRole("slider", { name: "Voice-over volume" }).fill("0");
  const ducked = await exportMp4();
  const duckIn = meanDb(ducked, voStart + 0.4, voEnd - 0.4);
  const duckOut = meanDb(ducked, 0.1, Math.max(0.5, voStart - 0.4));
  check("Music ducks during voice-over", duckOut - duckIn > 7, `outside ${duckOut} dB, during ${duckIn} dB`);

  // 4) Voice-over alone: remove music, voice volume back to 100%.
  await page.getByTestId("audio-music-remove").click();
  await page.getByRole("slider", { name: "Voice-over volume" }).fill("1");
  const voiceOnly = await exportMp4();
  const vIn = meanDb(voiceOnly, voStart + 0.3, voEnd - 0.3);
  const vOut = meanDb(voiceOnly, Math.min(5.5, voEnd + 0.3), 6);
  check("Voice-over in export", vIn > -40 && vIn - vOut > 20, `during ${vIn} dB, after ${vOut} dB`);

  // 5) Move the voice-over 1 s later by dragging its bar.
  await page.getByTestId("audio-bar-voice").click();
  const bar = await page.getByTestId("audio-bar-voice").boundingBox();
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 20, bar.y + bar.height / 2, { steps: 4 });
  await page.mouse.move(bar.x + bar.width / 2 + 40, bar.y + bar.height / 2, { steps: 4 });
  await page.mouse.up();
  const moved = await page.getByTestId("audio-voice-item").innerText();
  const newStart = toSec(moved.match(/(\d:\d\d\.\d) →/)[1]);
  check("Drag moves voice-over by 1s", Math.abs(newStart - voStart - 1) < 0.15, `${voStart}s → ${newStart}s`);

  // 6) Delete it.
  await page.getByTestId("audio-voice-delete").click();
  check("Delete voice-over", (await page.getByTestId("audio-bar-voice").count()) === 0);
  await page.getByTestId("audio-done").click();

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message);
  await page.screenshot({ path: `${SHOTS}/zz-p3-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

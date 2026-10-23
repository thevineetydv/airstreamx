// tests/studio-editor/editor.test.mjs
//
// End-to-end check for the Studio Editor (Phase 1) on a phone-sized screen.
// Imports two VP9 WebM clips (Chromium has no H.264), then:
// split -> delete -> trim -> move -> play -> export 720p -> verify the file -> hand to upload modal.
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/editor.test.mjs [baseUrl]
// Env: CHROMIUM_PATH (default /opt/pw-browsers/chromium), SHOTS_DIR (default studio-editor-screenshots)
//
// Exits with code 1 on any failure.

import { chromium } from "playwright";
import { mkdirSync, statSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const FIXTURES = path.join(here, "fixtures");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// "0:07.0 / 0:10.0" -> 10.0
const totalFromLabel = (text) => {
  const m = text.split("/")[1].trim().match(/(\d+):(\d+)\.(\d)/);
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, // Pixel 7
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  check("Editor route loads (lazy chunk)", true);
  await page.waitForTimeout(1500); // let the site splash fade out
  check("Site header / bottom nav hidden", (await page.locator("nav.fixed.bottom-0").count()) === 0);
  await page.screenshot({ path: `${SHOTS}/01-empty.png` });

  // 1. Import two clips at once.
  await page.getByTestId("file-input").setInputFiles([
    path.join(FIXTURES, "landscape-6s.webm"),
    path.join(FIXTURES, "portrait-4s-noaudio.webm"),
  ]);
  await page.getByTestId("clip-1").waitFor({ timeout: 30000 });
  const label = page.getByTestId("time-label");
  check("Two clips imported", (await page.locator('[data-testid^="clip-"]').count()) === 2);
  check("Total = 10s", Math.abs(totalFromLabel(await label.innerText()) - 10) < 0.15, await label.innerText());
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/02-imported.png` });

  // 2. Scrub to 3s and split.
  const scrollTo = async (seconds) => {
    await page.getByTestId("timeline-scroll").evaluate((el, s) => { el.scrollLeft = s * 40; }, seconds);
    await page.waitForTimeout(300);
  };
  await scrollTo(3);
  check("Scrub moves playhead", (await label.innerText()).startsWith("0:03.0"), await label.innerText());
  await page.getByTestId("tool-split").click();
  check("Split -> 3 clips", (await page.locator('[data-testid^="clip-"]').count()) === 3);
  check("Split keeps total 10s", Math.abs(totalFromLabel(await label.innerText()) - 10) < 0.15);

  // 3. The right half (3s-6s) is selected after split -> delete it.
  check("Right half selected after split", (await page.getByTestId("clip-1").getAttribute("data-selected")) === "true");
  await page.getByTestId("tool-delete").click();
  check("Delete -> 2 clips", (await page.locator('[data-testid^="clip-"]').count()) === 2);
  check("Total = 7s after delete", Math.abs(totalFromLabel(await label.innerText()) - 7) < 0.15, await label.innerText());

  // 4. Trim the end of the first clip by 1s (40 px at default zoom).
  await page.getByTestId("clip-0").click();
  const handle = page.getByTestId("trim-out");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  check("Trim -> total 6s", Math.abs(totalFromLabel(await label.innerText()) - 6) < 0.15, await label.innerText());
  await page.waitForTimeout(600);
  // Two preview <video> elements; the visible one is marked data-active.
  const frameReady = await page.locator('[data-testid^="preview-video-"][data-active="true"]').evaluate((v) => v.readyState >= 2 && Math.abs(v.currentTime - 1.98) < 0.1);
  check("Preview shows the trimmed edge frame", frameReady);
  await page.screenshot({ path: `${SHOTS}/03-trimmed.png` });

  // 5. Move the first clip to the right (portrait clip first now).
  // (Phase 12: no Move buttons — long-press the clip and drag it.)
  {
    const a = await page.getByTestId("clip-0").boundingBox();
    const b = await page.getByTestId("clip-1").boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550);
    await page.mouse.move(b.x + b.width * 0.85, a.y + a.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  check("Move right keeps 2 clips", (await page.locator('[data-testid^="clip-"]').count()) === 2);

  // 6. Play from start for ~1.2s.
  await scrollTo(0);
  await page.getByTestId("play-toggle").click();
  await page.waitForTimeout(1200);
  const playedTo = (await label.innerText()).split("/")[0].trim();
  await page.getByTestId("play-toggle").click();
  const [, s, d] = playedTo.match(/\d+:(\d+)\.(\d)/);
  const played = Number(s) + Number(d) / 10;
  check("Preview plays", played > 0.5, playedTo);
  await page.screenshot({ path: `${SHOTS}/04-preview.png` });

  // 7. Export 720p.
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-panel").waitFor();
  await page.screenshot({ path: `${SHOTS}/05-export-setup.png` });
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-progress").waitFor({ timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/06-exporting.png` });
  await Promise.race([
    page.getByTestId("export-done").waitFor({ timeout: 120000 }),
    page.getByTestId("export-error").waitFor({ timeout: 120000 }).then(async () => {
      throw new Error(`Export error: ${await page.getByTestId("export-error").innerText()}`);
    }),
  ]);
  const summary = await page.getByTestId("export-done").innerText();
  check("Export finished", true, summary.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/07-export-done.png` });

  // 8. Download and inspect the MP4.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-export").click(),
  ]);
  const out = path.join(SHOTS, "export.mp4");
  await download.saveAs(out);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", out]).toString());
  const v = probe.streams.find((st) => st.codec_type === "video");
  const a = probe.streams.find((st) => st.codec_type === "audio");
  const dur = Number(probe.format.duration);
  check("Output is MP4", /mp4|mov/.test(probe.format.format_name), probe.format.format_name);
  // First clip is portrait now -> output is portrait 720x1280.
  check("Output 720x1280 (portrait, follows first clip)", v.width === 720 && v.height === 1280, `${v.codec_name} ${v.width}x${v.height}`);
  check("Output duration ≈ 6s", Math.abs(dur - 6) < 0.2, `${dur.toFixed(2)}s`);
  check("Audio track present (silence for no-audio clip)", !!a, a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : "none");
  check("Audio length matches video", !!a && Math.abs(Number(a.duration ?? dur) - Number(v.duration ?? dur)) < 0.1);
  // Decode the whole file once: catches broken frames / packets.
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", out, "-f", "null", "-"]);
  check("Output decodes cleanly with ffmpeg", true, `${(statSync(out).size / 1024).toFixed(0)} KB`);

  // 9. Hand off to the normal upload flow.
  await page.getByTestId("upload-export").click();
  // The modal auto-fills the title from the file name ("Studio edit 19 Oct 2026").
  const titleValue = await page
    .waitForFunction(() => [...document.querySelectorAll("input")].map((e) => e.value).find((v) => /studio edit/i.test(v)), null, { timeout: 5000 })
    .then((h) => h.jsonValue())
    .catch(() => "");
  const modalHasFile = await page.getByText(/Studio edit - .*\.mp4/).count();
  check("Upload modal opened with exported file", modalHasFile > 0 && /studio edit/i.test(titleValue), titleValue);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/08-upload-handoff.png` });

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message);
  await page.screenshot({ path: `${SHOTS}/zz-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

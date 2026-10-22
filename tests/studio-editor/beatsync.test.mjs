// tests/studio-editor/beatsync.test.mjs
//
// Phase 10 check: beat sync.
//   1. Beat detection on the library tracks (known tempos from the generator:
//      Chai Break 80, Bazaar Bounce 112, Festive Dhol 100; Sunrise Ghat is
//      ambient → "no clear beat").
//   2. Template (Shop offer, RED 3 s + GREEN 3 s): cut, ending and template
//      items land on beat marks; music starts at the chosen place in the track
//      (checked in the exported audio by correlation with the track).
//   3. Beat sync button for any music; Undo; calm track → nothing moved.
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/beatsync.test.mjs [baseUrl]

import { chromium } from "playwright";
import { buildSync } from "esbuild";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const RED = path.join(here, "fixtures", "red-3s.webm");
const GREEN = path.join(here, "fixtures", "green-3s.webm");
const LAND = path.join(here, "fixtures", "landscape-6s.webm");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const pcm = (file, rate, extra = []) => {
  const raw = execFileSync("ffmpeg", ["-v", "error", ...extra, "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
};

// ── 1. Detection (same code as the app, bundled for Node) ──
const tmp = mkdtempSync(path.join(tmpdir(), "beats-"));
buildSync({ entryPoints: [path.join(root, "src/features/studio-editor/audio/beats.ts")], outfile: path.join(tmp, "beats.mjs"), format: "esm", bundle: true, logLevel: "error" });
const { detectBeats } = await import(pathToFileURL(path.join(tmp, "beats.mjs")).href);
const expected = { "chai-break": 80, "bazaar-bounce": 112, "festive-dhol": 100 };
for (const [id, bpm] of Object.entries(expected)) {
  const s = pcm(path.join(root, "public/studio-music", `${id}.mp3`), 44100);
  const r = detectBeats(s, 44100);
  // Generator puts beat k at k·60/bpm, so the grid error is measurable.
  const step = 60 / bpm;
  const err = Math.max(...r.beats.map((b) => { const k = Math.round(b / step); return Math.abs(b - k * step); }));
  check(`${id}: ${bpm} BPM`, Math.abs(r.bpm - bpm) < 1 && r.confidence >= 0.3, `${r.bpm.toFixed(1)} BPM, conf ${r.confidence.toFixed(2)}`);
  check(`${id}: beats on the grid (±25 ms)`, err < 0.025, `max ${(err * 1000).toFixed(0)} ms`);
}
{
  const r = detectBeats(pcm(path.join(root, "public/studio-music/sunrise-ghat.mp3"), 44100), 44100);
  check("sunrise-ghat (ambient): low confidence", r.confidence < 0.3, `conf ${r.confidence.toFixed(2)}`);
}

// ── 2/3. In the editor ──
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const markers = async () => (await page.locator('[data-testid="beat-marker"]').evaluateAll((els) => els.map((e) => Number(e.dataset.t))));
const durations = async () => (await page.locator("[data-clip-block]").evaluateAll((els) => els.map((e) => Number(e.dataset.duration))));
const nearest = (list, t) => Math.min(...list.map((m) => Math.abs(m - t)));

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-template").waitFor({ timeout: 20000 });
  await page.getByTestId("start-template").click();
  await page.getByTestId("template-shop-offer").click();
  await page.getByTestId("template-field-headline").fill("Beat sale!");
  await page.getByTestId("template-field-offer").fill("30% OFF");
  await page.getByTestId("template-field-business").fill("Sharma Store");
  await page.getByTestId("template-field-area").fill("Aminabad");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("template-apply").click()]);
  await chooser.setFiles([RED, GREEN]);
  await page.getByTestId("clip-1").waitFor({ timeout: 30000 });
  await page.getByTestId("beat-marker").first().waitFor({ timeout: 15000 });

  const m = await markers();
  const [d0, d1] = await durations();
  const total = d0 + d1;
  check("Template: beat marks on the music bar", m.length >= 8, `${m.length} marks`);
  check("Template: the cut is on a beat", nearest(m, d0) < 0.02, `cut ${d0.toFixed(3)} s, beat ${(nearest(m, d0) * 1000).toFixed(0)} ms away`);
  check("Template: video ends on a beat", nearest(m, total) < 0.02 && total < 6 && total > 5, `ends ${total.toFixed(3)} s`);
  const starts = await page.locator('[data-testid^="overlay-bar-"]').evaluateAll((els) => els.map((e) => Number(e.dataset.start)).filter((s) => s > 0.05));
  check("Template: items appear on beats", starts.length > 0 && starts.every((s) => nearest(m, s) < 0.02), starts.map((s) => s.toFixed(2)).join(", "));
  const offset = Number(await page.getByTestId("audio-bar-music").getAttribute("data-offset"));
  check("Template: music starts at a bar", Number.isFinite(offset), `${offset.toFixed(2)} s into the track`);
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 1.5 * 40; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/p10-01-template-synced.png` });

  // Export with the original sound muted → audio is music only. It must match
  // the track from `offset` (proves preview/export use the same start).
  await page.getByTestId("tool-audio").click();
  await page.getByTestId("audio-mute-original").click();
  check("Audio panel shows the sync", (await page.getByTestId("beat-sync-status").innerText()).includes("112 BPM"), await page.getByTestId("beat-sync-status").innerText());
  await page.screenshot({ path: `${SHOTS}/p10-02-audio-panel.png` });
  await page.getByTestId("audio-done").click();
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "beatsync-1.mp4");
  await dl.saveAs(out);
  await page.getByText("Close").click();
  const R = 8000;
  const exp = pcm(out, R).subarray(Math.round(0.2 * R), Math.round(2.2 * R));
  const track = pcm(path.join(root, "public/studio-music/bazaar-bounce.mp3"), R);
  let best = { lag: 0, c: -1 };
  for (let lag = -Math.round(0.15 * R); lag <= Math.round(0.15 * R); lag++) {
    const s0 = Math.round((offset + 0.2) * R) + lag;
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < exp.length; i++) { const x = exp[i], y = track[(s0 + i + track.length) % track.length]; xy += x * y; xx += x * x; yy += y * y; }
    const c = xy / Math.sqrt(xx * yy || 1);
    if (c > best.c) best = { lag, c };
  }
  check("Export: music starts at the synced place", best.c > 0.8 && Math.abs(best.lag / R) < 0.03, `corr ${best.c.toFixed(2)} at ${((best.lag / R) * 1000).toFixed(0)} ms`);

  // ── Beat sync button on a normal edit ──
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.getByTestId("file-input").setInputFiles([LAND]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  await page.getByTestId("tool-audio").click();
  await page.getByTestId("audio-use-festive-dhol").click();
  await page.getByTestId("beat-sync").waitFor();
  check("No beat marks before syncing", (await page.locator('[data-testid="beat-marker"]').count()) === 0);
  await page.getByTestId("beat-sync").click();
  await page.getByTestId("beat-marker").first().waitFor({ timeout: 15000 });
  const m2 = await markers();
  const [e0] = await durations();
  check("Button: 100 BPM found", (await page.getByTestId("beat-sync-status").innerText()).includes("100 BPM"));
  check("Button: video now ends on a beat", nearest(m2, e0) < 0.02 && e0 <= 6, `${e0.toFixed(3)} s`);
  await page.getByTestId("undo").click();
  await page.waitForTimeout(300);
  check("Undo removes the sync", (await page.locator('[data-testid="beat-marker"]').count()) === 0 && Math.abs((await durations())[0] - 6) < 0.05);

  // Calm track: nothing is moved.
  await page.getByTestId("audio-music-change").click();
  await page.getByTestId("audio-use-sunrise-ghat").click();
  await page.getByTestId("beat-sync").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="beat-sync-status"]')?.textContent?.includes("no clear beat"), null, { timeout: 15000 });
  check("Calm track: 'no clear beat', nothing moved", (await page.locator('[data-testid="beat-marker"]').count()) === 0 && Math.abs((await durations())[0] - 6) < 0.05);
  await page.screenshot({ path: `${SHOTS}/p10-03-no-beat.png` });

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p10-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

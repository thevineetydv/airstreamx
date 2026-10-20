// tests/studio-editor/captions.test.mjs
//
// Phase 4 check: auto captions.
//
// Part A — the REAL speech worker: loads transformers.js, then the model
// download is blocked on purpose; the editor must show a clear error.
// (Set TRANSFORMERS_LOCAL=/path/to/transformers.min.js to serve the library
// from disk when jsDelivr is not reachable.)
//
// Part B — the worker is replaced by a fake Whisper that returns fixed text,
// so everything around it is tested without downloading a model: audio sent
// for recognition, caption splitting, editing, preview, burn-in export,
// subtitle track inside the MP4 and the .srt file.
//
// Real recognition quality (Hindi / English) must be checked by hand.
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/captions.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
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

function frameRGB(file, t, w, h) {
  return execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
}
function regionDiff(a, b, w, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * w + x) * 3;
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return sum / n;
}

const LAUNCH = { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" };
const CONTEXT = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };
const browser = await chromium.launch(LAUNCH);
const pageErrors = [];

async function openEditor(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByTestId("file-input").setInputFiles([FIXTURE]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  return page;
}

try {
  // ───────────── Part A: real worker, model download blocked ─────────────
  {
    const context = await browser.newContext(CONTEXT);
    let libServed = false, modelAsked = false;
    if (process.env.TRANSFORMERS_LOCAL) {
      const body = readFileSync(process.env.TRANSFORMERS_LOCAL);
      await context.route(/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers@/, (route) => {
        libServed = true;
        route.fulfill({ status: 200, contentType: "text/javascript", body, headers: { "access-control-allow-origin": "*" } });
      });
    }
    await context.route(/huggingface\.co/, (route) => { modelAsked = true; route.abort("internetdisconnected"); });
    const page = await openEditor(context);
    await page.getByTestId("tool-captions").click();
    await page.getByTestId("captions-generate").click();
    await page.getByTestId("captions-error").waitFor({ timeout: 60000 });
    const msg = await page.getByTestId("captions-error").innerText();
    if (process.env.TRANSFORMERS_LOCAL) check("Worker loaded transformers.js", libServed);
    check("Worker asked HuggingFace for the model", modelAsked);
    check("Clear error when model can't download", /speech model|internet/i.test(msg), msg);
    await page.screenshot({ path: `${SHOTS}/p4-00-offline-error.png` });
    await context.close();
  }

  // ───────────── Part B: fake Whisper ─────────────
  const context = await browser.newContext(CONTEXT);
  await context.addInitScript(() => {
    window.__asrCalls = [];
    const RealWorker = window.Worker;
    class FakeAsrWorker extends EventTarget {
      constructor(url, opts) {
        super();
        if (!String(url).includes("asr.worker")) return new RealWorker(url, opts);
        this.onmessage = null;
      }
      postMessage(msg) {
        const a = msg.audio;
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
        window.__asrCalls.push({ len: a.length, rms: Math.sqrt(sum / a.length), language: msg.language, model: msg.model });
        const send = (data) => {
          const ev = new MessageEvent("message", { data });
          this.dispatchEvent(ev);
          if (this.onmessage) this.onmessage(ev);
        };
        setTimeout(() => send({ type: "download", progress: 50, loaded: 40e6, total: 80e6 }), 50);
        setTimeout(() => send({ type: "ready" }), 400);
        setTimeout(() => send({
          type: "chunks", jobId: msg.jobId, chunks: [
            { start: 0.5, end: 2.5, text: " नमस्ते लखनऊ, आज हम चलेंगे हज़रतगंज" },
            { start: 2.6, end: 3.0, text: " [Music]" },
            // Typical junk on songs (from a real test) — must all be dropped:
            { start: 2.62, end: 2.7, text: " ai ai ai ai ai ai ai ai ai ai ai ai ai ai" },
            { start: 2.7, end: 2.8, text: " तुज जितन ए प्र तुड पार तुड पार तुड पार तुड" },
            { start: 2.8, end: 2.9, text: " ایک دن سنم کو اپنا بنانے کے لئے" },
            { start: 2.9, end: 3.0, text: " 1.000" },
            { start: 3.2, end: null, text: " aaj ka special offer dekhiye sirf hamare yahan Sharma Chaat Corner par" },
          ],
        }), 700);
      }
      terminate() {}
    }
    window.Worker = FakeAsrWorker;
  });
  const page = await openEditor(context);

  await page.getByTestId("tool-captions").click();
  await page.getByTestId("captions-setup").waitFor();
  await page.screenshot({ path: `${SHOTS}/p4-01-setup.png` });
  await page.getByTestId("captions-generate").click();
  await page.getByTestId("captions-progress").waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/p4-02-progress.png` });
  await page.getByTestId("caption-item").first().waitFor({ timeout: 30000 });

  const calls = await page.evaluate(() => window.__asrCalls);
  check("Speech audio sent once at 16 kHz (6 s)", calls.length === 1 && Math.abs(calls[0].len - 96000) < 200, `${calls[0]?.len} samples`);
  check("Speech audio is not silent", calls[0].rms > 0.03, `rms ${calls[0].rms.toFixed(3)}`);
  check("Default model + language", calls[0].model === "Xenova/whisper-base" && calls[0].language === "hindi", `${calls[0].model} / ${calls[0].language}`);

  const n = await page.getByTestId("caption-item").count();
  check("3 captions (noise/loops/Urdu/numbers dropped, long line split)", n === 3, `${n} lines`);
  check("Caption blocks on timeline", (await page.getByTestId("caption-block").count()) === 3);
  const texts = await page.getByTestId("caption-text").evaluateAll((els) => els.map((e) => e.value));
  check("Hindi text kept", texts[0] === "नमस्ते लखनऊ, आज हम चलेंगे हज़रतगंज", texts[0]);
  check("Long line split under 42 chars", texts.slice(1).every((t) => t.length <= 42), texts.slice(1).join(" | "));

  // Edit a caption.
  await page.getByTestId("caption-text").first().fill("नमस्ते Lucknow! आज हम चलेंगे हज़रतगंज");
  await page.waitForTimeout(400);
  const drawn = await page.getByTestId("overlay-canvas").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, Math.round(c.height * 0.75), c.width, Math.round(c.height * 0.2)).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  check("Caption drawn on preview", drawn > 500, `${drawn} px`);
  await page.screenshot({ path: `${SHOTS}/p4-03-edit.png` });

  // Add a manual caption at 5.7 s, then delete it.
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 5.7 * 40; });
  await page.waitForTimeout(300);
  await page.getByTestId("captions-add").click();
  check("Add manual caption", (await page.getByTestId("caption-item").count()) === 4);
  await page.getByRole("button", { name: "Delete caption" }).last().click();
  check("Delete caption", (await page.getByTestId("caption-item").count()) === 3);

  // Style: yellow text.
  await page.getByRole("button", { name: "Yellow" }).click();

  // ── Export 1: burned in ──
  const exportOnce = async (name) => {
    await page.getByTestId("open-export").click();
    await page.getByTestId("start-export").click();
    await Promise.race([
      page.getByTestId("export-done").waitFor({ timeout: 120000 }),
      page.getByTestId("export-error").waitFor({ timeout: 120000 }).then(async () => {
        throw new Error(`Export error: ${await page.getByTestId("export-error").innerText()}`);
      }),
    ]);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
    const out = path.join(SHOTS, name);
    await dl.saveAs(out);
    return out;
  };
  const burned = await exportOnce("captions-burned.mp4");
  const W = 1280, H = 720;
  const src15 = frameRGB(FIXTURE, 1.5, W, H), out15 = frameRGB(burned, 1.5, W, H);
  const src28 = frameRGB(FIXTURE, 2.8, W, H), out28 = frameRGB(burned, 2.8, W, H);
  const band = [200, Math.round(H * 0.8), 1080, Math.round(H * 0.92)];
  check("Burned caption visible at 1.5 s", regionDiff(out15, src15, W, ...band) > 20);
  check("No caption in the gap at 2.8 s", regionDiff(out28, src28, W, ...band) < 12);
  check("No .srt when subtitle track is off", (await page.getByTestId("download-srt").count()) === 0);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", burned, "-frames:v", "1", path.join(SHOTS, "p4-04-burned-frame.png")]);
  await page.getByText("Close").click();

  // ── Export 2: subtitle track only ──
  await page.getByTestId("captions-burn").click();
  await page.getByTestId("captions-track").click();
  const soft = await exportOnce("captions-track.mp4");
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", soft]).toString());
  // WebVTT-in-MP4 ("wvtt", ISO 14496-30). ffmpeg lists it but cannot decode it;
  // Safari/iOS, Android ExoPlayer and VLC can.
  const sub = probe.streams.find((s) => s.codec_tag_string === "wvtt");
  check("MP4 has a WebVTT subtitle track (Hindi)", !!sub && sub.tags?.language === "hin", sub ? `${sub.codec_tag_string} ${sub.tags?.language}` : "none");
  check("Subtitle track contains the caption text", readFileSync(soft).includes(Buffer.from("नमस्ते Lucknow!")));
  const soft15 = frameRGB(soft, 1.5, W, H);
  check("Not burned when burn-in is off", regionDiff(soft15, src15, W, ...band) < 12);
  const [srtDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-srt").click()]);
  const srtPath = path.join(SHOTS, "captions.srt");
  await srtDl.saveAs(srtPath);
  const srt = readFileSync(srtPath, "utf8");
  check(".srt has edited text + timing", srt.includes("00:00:00,500 --> 00:00:02,500") && srt.includes("नमस्ते Lucknow!"), srt.split("\n").slice(0, 3).join(" ⏎ "));
  await page.getByText("Close").click();

  // ── Regenerate in English with music on: music must NOT reach recognition ──
  await page.getByTestId("captions-done").click();
  await page.getByTestId("tool-audio").click();
  await page.getByTestId("audio-use-bazaar-bounce").click();
  await page.getByTestId("audio-done").click();
  await page.getByTestId("tool-captions").click();
  await page.getByTestId("captions-regenerate").click();
  await page.getByTestId("captions-lang-english").click();
  await page.getByTestId("captions-model-fast").click();
  await page.getByTestId("captions-generate").click();
  await page.waitForFunction(() => window.__asrCalls.length === 2, null, { timeout: 30000 });
  await page.getByTestId("caption-item").first().waitFor();
  const calls2 = await page.evaluate(() => window.__asrCalls);
  check("Regenerate uses chosen language + model", calls2[1].language === "english" && calls2[1].model === "Xenova/whisper-tiny");
  check("Music excluded from recognition audio", Math.abs(calls2[1].rms - calls2[0].rms) < 0.005, `${calls2[0].rms.toFixed(3)} vs ${calls2[1].rms.toFixed(3)}`);
  await page.screenshot({ path: `${SHOTS}/p4-05-list.png` });

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

// tests/studio-editor/drafts.test.mjs
//
// Phase 6a check: undo / redo and drafts saved on the device.
//   - split / trim drag / typing are each ONE undo step; redo; Ctrl+Z
//   - auto-save, reload, open the draft: clips, speed, text, music,
//     voice-over and canvas shape all come back; export still works
//   - editing an opened draft updates it (no duplicate draft)
//   - a draft whose video was not stored asks for the file again
//   - delete a draft
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/drafts.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const FIXTURE = path.join(here, "fixtures", "landscape-6s.webm");
mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(path.join(tmpdir(), "studio-drafts-"));
const MIC_WAV = path.join(tmp, "voice.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
  "aevalsrc='0.5*sin(2*PI*(220+80*sin(2*PI*0.7*t))*t)':s=48000:d=30", "-ac", "1", MIC_WAV]);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC_WAV}`],
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
});
await context.grantPermissions(["microphone"]);
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const label = () => page.getByTestId("time-label").innerText();
const total = async () => (await label()).split("/")[1].trim();
const clipCount = () => page.locator('[data-testid^="clip-"][data-selected]').count();
const waitSaved = () => page.waitForSelector('[data-testid="save-status"][data-status="saved"]', { timeout: 20000 });
const scrollTo = async (s) => {
  await page.getByTestId("timeline-scroll").evaluate((el, x) => { el.scrollLeft = x * 40; }, s);
  await page.waitForTimeout(300);
};
const openEditor = async () => {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
};

try {
  await openEditor();
  check("No drafts at first", (await page.getByTestId("drafts-list").count()) === 0);
  await page.getByTestId("file-input").setInputFiles([FIXTURE]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });

  // ── Undo / redo ──
  await scrollTo(3);
  await page.getByTestId("tool-split").click();
  check("Split -> 2 clips", (await clipCount()) === 2);
  await page.getByTestId("undo").click();
  check("Undo split -> 1 clip", (await clipCount()) === 1);
  await page.getByTestId("redo").click();
  check("Redo split -> 2 clips", (await clipCount()) === 2);

  // A trim drag = many small updates, but ONE undo step.
  await page.getByTestId("clip-0").click();
  const before = await total();
  const h = await page.getByTestId("trim-out").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(h.x + h.width / 2 - i * 5, h.y + h.height / 2);
  await page.mouse.up();
  const trimmed = await total();
  await page.getByTestId("undo").click();
  check("Trim drag undone in one step", trimmed !== before && (await total()) === before, `${before} → ${trimmed} → ${await total()}`);
  await page.getByTestId("tool-deselect").click();

  // Typing = one undo step; then undo removes the text itself.
  await page.getByTestId("tool-text").click();
  const box = page.getByTestId("overlay-text");
  await box.fill("");
  await box.pressSequentially("Namaste", { delay: 40 });
  await page.getByTestId("overlay-done").click();
  await page.locator("body").press("Control+z");
  await page.getByTestId("overlay-bar-text").click();
  const afterOne = await page.getByTestId("overlay-text").inputValue();
  check("Ctrl+Z undoes the whole typed word", afterOne === "Your text", afterOne);
  await page.getByTestId("overlay-done").click();
  await page.locator("body").press("Control+z");
  check("Next undo removes the text", (await page.locator('[data-testid^="overlay-bar-"]').count()) === 0);
  await page.locator("body").press("Control+Shift+z");
  await page.locator("body").press("Control+Shift+z");
  await page.getByTestId("overlay-bar-text").click();
  check("Redo twice brings text back", (await page.getByTestId("overlay-text").inputValue()) === "Namaste");
  await page.getByTestId("overlay-done").click();
  await page.screenshot({ path: `${SHOTS}/p6a-01-undo.png` });

  // ── Build an edit to save ──
  await page.getByTestId("clip-0").click();
  await page.getByTestId("tool-speed").click();
  await page.getByTestId("speed-2").click();
  await page.getByTestId("clip-done").click();
  await page.getByTestId("tool-deselect").click();
  await page.getByTestId("tool-audio").click();
  await page.getByTestId("audio-use-chai-break").click();
  await scrollTo(0.5);
  await page.getByTestId("audio-record").click();
  await page.getByTestId("audio-stop-record").waitFor();
  await page.waitForTimeout(1500);
  await page.getByTestId("audio-stop-record").click();
  await page.getByTestId("audio-voice-item").waitFor();
  await page.getByTestId("audio-done").click();
  await page.getByTestId("open-aspect").click();
  await page.getByTestId("aspect-1:1").click();
  await page.getByTestId("aspect-done").click();
  await waitSaved();
  const savedTotal = await total();
  check("Auto-saved", true, `total ${savedTotal}`);
  await page.screenshot({ path: `${SHOTS}/p6a-02-saved.png` });

  // ── Reload and open ──
  await openEditor();
  check("Draft listed after reload", (await page.getByTestId("draft-item").count()) === 1);
  await page.screenshot({ path: `${SHOTS}/p6a-03-drafts.png` });
  await page.getByTestId("draft-item").locator("button").first().click();
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  check("Clips restored", (await clipCount()) === 2);
  check("Total length restored (speed kept)", (await total()) === savedTotal, await total());
  check("Speed restored", (await page.getByTestId("clip-speed-0").innerText()) === "2×");
  check("Text restored", (await page.getByTestId("overlay-bar-text").count()) === 1);
  check("Music restored", (await page.getByTestId("audio-bar-music").innerText()).includes("Chai Break"));
  check("Voice-over restored", (await page.getByTestId("audio-bar-voice").count()) === 1);
  check("Canvas shape restored", (await page.getByTestId("open-aspect").innerText()).includes("1:1"));
  check("Opening a draft starts a fresh undo history", await page.getByTestId("undo").isDisabled());
  await page.screenshot({ path: `${SHOTS}/p6a-04-reopened.png` });

  // Export works from restored files.
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "draft-export.mp4");
  await dl.saveAs(out);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", out]).toString());
  const v = probe.streams.find((s) => s.codec_type === "video");
  check("Export after reopening (square)", v.width === 720 && v.height === 720, `${v.width}×${v.height}`);
  await page.getByText("Close").click();

  // Edit the opened draft -> same draft updated, not a new one.
  await page.getByTestId("tool-sticker").click();
  await page.getByTestId("overlay-done").click();
  await waitSaved();
  await openEditor();
  check("Editing updates the same draft", (await page.getByTestId("draft-item").count()) === 1);

  // ── Video not stored -> pick it again ──
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("airstreamx-studio");
    req.onsuccess = () => {
      const tx = req.result.transaction("media", "readwrite");
      const store = tx.objectStore("media");
      const keys = store.getAllKeys();
      keys.onsuccess = () => { keys.result.filter((k) => !String(k).includes(":vo:")).forEach((k) => store.delete(k)); };
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.getByTestId("draft-item").waitFor({ timeout: 20000 });
  await page.getByTestId("draft-item").locator("button").first().click();
  await page.getByTestId("relink-panel").waitFor({ timeout: 20000 });
  check("Missing video -> asks for the file", (await page.getByTestId("relink-panel").innerText()).includes("landscape-6s.webm"));
  await page.screenshot({ path: `${SHOTS}/p6a-05-relink.png` });
  await page.getByTestId("relink-input").setInputFiles([FIXTURE]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  check("Re-picked file opens the draft", (await clipCount()) === 2 && (await total()) === savedTotal);
  await waitSaved();

  // ── Delete ──
  await openEditor();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("draft-delete").click();
  await page.waitForTimeout(500);
  check("Delete draft", (await page.getByTestId("draft-item").count()) === 0);

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p6a-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

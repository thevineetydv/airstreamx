// tests/studio-editor/templates.test.mjs
//
// Phase 8 check: ready-made templates.
//   Start flow: "Start with a template" → Shop offer → fill form → choose videos
//     (RED 3 s + GREEN 3 s) → 9:16, text/sticker/deal on the timeline, Bazaar Bounce
//     music, slide transition. Export is 720×1280 with the red offer card at the bottom.
//     One Undo removes the template but keeps the videos.
//   Editor flow: Template chip → Food review (area + shop name pre-filled from
//     last time) → replaces the shop template items, keeps the user's own text,
//     music becomes Chai Break.
//   Gallery thumbnails are drawn (not blank).
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/templates.test.mjs [baseUrl]

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
/** Share of pixels in a box matching `test`. */
function share(buf, test, x0, y0, x1, y1) {
  let n = 0, all = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * W + x) * 3;
    all++;
    if (test(buf[i], buf[i + 1], buf[i + 2])) n++;
  }
  return n / all;
}
const isRed = (r, g, b) => r > 120 && g < 70 && b < 70;
const isGreen = (r, g, b) => g > 120 && r < 90 && b < 90;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const count = (id) => page.getByTestId(id).count();

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-template").waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // ── Gallery ──
  await page.getByTestId("start-template").click();
  await page.getByTestId("template-panel").waitFor();
  check("Gallery shows 6 templates", (await page.locator('[data-testid="template-thumb"]').count()) === 6);
  const drawn = await page.locator('[data-testid="template-thumb"]').evaluateAll((cs) =>
    cs.map((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let bright = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220) bright++;
      return bright; // white text pixels
    }));
  check("Thumbnails show the template text", drawn.every((b) => b > 30), drawn.join(", "));
  await page.screenshot({ path: `${SHOTS}/p8-01-gallery.png` });

  // ── Form ──
  await page.getByTestId("template-shop-offer").click();
  check("Apply disabled until required fields are filled", await page.getByTestId("template-apply").isDisabled());
  await page.getByTestId("template-field-headline").fill("Mega Monsoon Sale!");
  await page.getByTestId("template-field-offer").fill("FLAT 40% OFF");
  await page.getByTestId("template-field-business").fill("Sharma Electronics");
  await page.getByTestId("template-field-area").fill("Hazratganj");
  await page.getByTestId("template-field-phone").fill("98765abc43210");
  check("Phone field keeps only digits", (await page.getByTestId("template-field-phone").inputValue()) === "9876543210");
  await page.screenshot({ path: `${SHOTS}/p8-02-form.png` });

  // ── Choose videos ──
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("template-apply").click()]);
  await chooser.setFiles([RED, GREEN]);
  await page.getByTestId("clip-1").waitFor({ timeout: 30000 });
  await page.getByTestId("audio-bar-music").waitFor({ timeout: 15000 });
  check("Canvas set to 9:16", (await page.getByTestId("open-aspect").innerText()).includes("9:16"));
  check("Template items on the timeline", (await count("overlay-bar-text")) === 1 && (await count("overlay-bar-sticker")) === 1 && (await count("overlay-bar-deal")) === 1);
  check("Music set to Bazaar Bounce", (await page.getByTestId("audio-bar-music").innerText()).includes("Bazaar Bounce"));
  check("Transition added between the clips", (await page.getByTestId("transition-btn-0").innerText()).includes("⧓"));
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 2 * 40; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/p8-03-applied.png` });

  // ── Export ──
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, "templates-1.mp4");
  await dl.saveAs(out);
  await page.getByText("Close").click();
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", out], { encoding: "utf8" });
  check("Export is 720×1280 with sound", /video,720,1280/.test(probe.replace(/\n/g, " ")) || (/720,1280/.test(probe) && /audio/.test(probe)), probe.trim().replace(/\n/g, " | "));
  const f = frame(out, 4.5); // green clip, offer card visible
  const card = share(f, isRed, Math.round(W * 0.2), Math.round(H * 0.74), Math.round(W * 0.8), Math.round(H * 0.84));
  const middle = share(f, isGreen, Math.round(W * 0.3), Math.round(H * 0.4), Math.round(W * 0.7), Math.round(H * 0.55));
  check("Red offer card at the bottom over the green clip", card > 0.4 && middle > 0.8, `card ${(card * 100).toFixed(0)}% red, middle ${(middle * 100).toFixed(0)}% green`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "4.5", "-i", out, "-frames:v", "1", path.join(SHOTS, "p8-04-export.png")]);

  // ── Undo: removes the template, keeps the videos ──
  await page.getByTestId("undo").click();
  await page.waitForTimeout(300);
  const overlaysAfterUndo = (await count("overlay-bar-text")) + (await count("overlay-bar-deal")) + (await count("overlay-bar-sticker"));
  check("One Undo removes the template", overlaysAfterUndo === 0 && (await count("audio-bar-music")) === 0, `${overlaysAfterUndo} items left`);
  check("…and keeps the videos", (await count("clip-1")) === 1);
  await page.getByTestId("redo").click();
  await page.waitForTimeout(300);
  check("Redo brings it back", (await count("overlay-bar-deal")) === 1);

  // ── Editor flow: own text + switch to Food review ──
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-text").fill("MY OWN TEXT");
  await page.getByTestId("overlay-done").click();
  await page.getByTestId("tool-template").click();
  await page.getByTestId("template-food-review").click();
  check("Area remembered from last time", (await page.getByTestId("template-field-area").inputValue()) === "Hazratganj");
  check("Shop name remembered too", (await page.getByTestId("template-field-place").inputValue()) === "Sharma Electronics");
  await page.getByTestId("template-field-dish").fill("Basket Chaat");
  await page.getByTestId("template-field-price").fill("₹90");
  await page.getByTestId("template-rating-5").click();
  await page.screenshot({ path: `${SHOTS}/p8-05-food-form.png` });
  await page.getByTestId("template-apply").click();
  await page.getByTestId("template-panel").waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  check("Old template items replaced", (await count("overlay-bar-deal")) === 0 && (await count("overlay-bar-sticker")) === 0 && (await count("overlay-bar-area")) === 1);
  check("User's own text kept (+4 template texts)", (await count("overlay-bar-text")) === 5, `${await count("overlay-bar-text")} text items`);
  check("Music switched to Chai Break", (await page.getByTestId("audio-bar-music").innerText()).includes("Chai Break"));
  await page.getByTestId("timeline-scroll").evaluate((el) => { el.scrollLeft = 1 * 40; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/p8-06-food-review.png` });

  // ── Desktop ──
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("tool-template").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/p8-07-desktop-gallery.png` });
  await page.getByTestId("template-close").click();

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p8-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

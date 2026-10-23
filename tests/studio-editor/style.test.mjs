// tests/studio-editor/style.test.mjs
//
// Phase 11 check: green screen, text styles, brand kit.
//   - Green screen on a VIDEO layer (green background + white square): green is
//     removed in the export (red main clip shows through), the white subject stays
//   - "Auto pick" finds an unusual green shade on a PICTURE layer and removes it
//   - Quick style "BREAKING" (red box), Neon glow, style chips
//   - Brand kit: logo + colour saved on the phone; brand colour first in the text
//     colours; "Add logo" puts it top-right; kept after reload; added to templates
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/style.test.mjs [baseUrl]

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
const GREEN = path.join(here, "fixtures", "green-3s.webm");
mkdirSync(SHOTS, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "studio-style-"));
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
// Green-screen video: studio green with a white square "subject" in the middle.
const GS_VIDEO = path.join(tmp, "greenscreen.webm");
ff("-f", "lavfi", "-i", "color=c=0x00b140:s=480x480:d=3:r=30", "-vf", "drawbox=x=160:y=160:w=160:h=160:color=white:t=fill", "-c:v", "libvpx-vp9", "-b:v", "1M", "-pix_fmt", "yuv420p", GS_VIDEO);
// Picture with an unusual green (#3cb043) and a white centre.
const GS_IMG = path.join(tmp, "odd-green.png");
ff("-f", "lavfi", "-i", "color=c=0x3cb043:s=300x300", "-vf", "drawbox=x=100:y=100:w=100:h=100:color=white:t=fill", "-frames:v", "1", GS_IMG);
// Logo: blue square on transparent background.
const LOGO = path.join(tmp, "logo.png");
ff("-f", "lavfi", "-i", "color=c=0x1d4ed8:s=200x200", "-frames:v", "1", LOGO);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let W = 720, H = 1280;
const frame = (file, t) =>
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 << 20 });
const px = (buf, x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };
function count(buf, test, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  let n = 0;
  for (let y = Math.round(y0); y < y1; y += 2) for (let x = Math.round(x0); x < x1; x += 2) { const [r, g, b] = px(buf, x, y); if (test(r, g, b)) n++; }
  return n;
}
const isGreen = (r, g, b) => g > 120 && r < 110 && b < 110;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await context.newPage();
// These checks use style / font / animation / keyframe controls, which live
// under "More options" + Pro mode since Phase 12: open both for the test.
await context.addInitScript(() => localStorage.setItem("studio-editor-prefs", JSON.stringify({ more: true, pro: true })));
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
let n = 0;
async function exportMp4() {
  await page.getByTestId("open-export").click();
  await page.getByTestId("start-export").click();
  await page.getByTestId("export-done").waitFor({ timeout: 120000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  const out = path.join(SHOTS, `style-${++n}.mp4`);
  await dl.saveAs(out);
  await page.getByText("Close").click();
  return out;
}

try {
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
  await page.getByTestId("file-input").setInputFiles([RED]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });

  // ── Green screen: video layer ──
  await page.getByTestId("layer-input").setInputFiles([GS_VIDEO]);
  await page.getByTestId("layer-panel").waitFor({ timeout: 30000 });
  await page.getByTestId("chroma-green").click();
  await page.waitForTimeout(600);
  check("Preview shows the keyed layer", await page.getByTestId("preview-layer-keyed").isVisible());
  await page.screenshot({ path: `${SHOTS}/p11-01-green-screen.png` });
  await page.getByTestId("layer-done").click();

  const out1 = await exportMp4();
  const f1 = frame(out1, 1);
  // Layer box (default place) — find the white subject, then look just outside it.
  let sx = 0, sy = 0, sn = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const [r, g, b] = px(f1, x, y); if (r > 220 && g > 220 && b > 220) { sx += x; sy += y; sn++; } }
  const cx = sx / sn, cy = sy / sn;
  const greenLeft = count(f1, isGreen);
  check("Export: no green left from the green screen", greenLeft < 200, `${greenLeft} green px`);
  check("Export: white subject kept", sn > 500, `${sn} white px at (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
  const around = px(f1, cx, cy - Math.sqrt(sn * 4) * 0.9);
  // (Above the 16:9 red clip is its blurred, darker copy — still red.)
  check("Export: red main clip shows where the green was", around[0] > 110 && around[1] < 60 && around[2] < 60, `rgb(${around})`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", out1, "-frames:v", "1", path.join(SHOTS, "p11-02-green-export.png")]);

  // ── Auto pick on a picture with an odd green ──
  await page.getByTestId("layer-bar-video").click();
  await page.getByTestId("layer-delete").click();
  await page.getByTestId("layer-input").setInputFiles([GS_IMG]);
  await page.getByTestId("layer-panel").waitFor();
  await page.waitForTimeout(400);
  await page.getByTestId("chroma-auto").click();
  await page.waitForTimeout(400);
  const picked = await page.getByTestId("chroma-auto").locator("span").getAttribute("style");
  check("Auto pick finds the screen colour", /rgb\((5\d|6\d), 1[6-9]\d, (5\d|6\d|7\d)\)|#3[a-f0-9]b[0-9a-f]4/i.test(picked ?? ""), picked ?? "none");
  await page.getByTestId("layer-done").click();
  const out2 = await exportMp4();
  const f2 = frame(out2, 1);
  check("Auto pick: odd green removed in export", count(f2, (r, g, b) => g > 140 && r < 90 && b < 100 && r > 30) < 150);

  // ── Text: quick style BREAKING + Neon ──
  await page.getByTestId("tool-text").click();
  await page.keyboard.type("LIVE NOW");
  await page.getByTestId("title-breaking").click();
  check("Quick style sets font + box + red", (await page.getByTestId("font-impact").getAttribute("aria-pressed")) === "true" && (await page.getByTestId("text-style-box").getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: `${SHOTS}/p11-03-quick-styles.png` });
  await page.getByTestId("overlay-done").click();
  const out3 = await exportMp4();
  const f3 = frame(out3, 1.5);
  const redBox = count(f3, (r, g, b) => Math.abs(r - 220) < 25 && Math.abs(g - 38) < 25 && Math.abs(b - 38) < 25, W * 0.15, H * 0.4, W * 0.85, H * 0.6);
  check("BREAKING: red box behind the text", redBox > 400, `${redBox} px`);
  await page.getByTestId("overlay-bar-text").click();
  await page.getByTestId("text-style-neon").click();
  await page.getByTestId("accent-2563eb").click(); // blue glow: easy to measure on the red clip
  await page.getByTestId("overlay-done").click();
  const out4 = await exportMp4();
  const f4 = frame(out4, 1.5);
  const glow = count(f4, (r, g, b) => b > 90 && b > g + 30 && !(r > 220 && g > 220), W * 0.1, H * 0.4, W * 0.9, H * 0.6);
  check("Neon: coloured glow around the text", glow > 150, `${glow} px`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", out4, "-frames:v", "1", path.join(SHOTS, "p11-04-neon.png")]);

  // ── Brand kit ──
  await page.getByTestId("tool-more").click();
  await page.getByTestId("tool-brand").click();
  await page.getByTestId("brand-logo-input").setInputFiles([LOGO]);
  await page.getByTestId("brand-logo-preview").waitFor();
  await page.getByTestId("brand-color-input").fill("#123abc");
  await page.getByTestId("brand-color-add").click();
  check("Brand colour saved", (await page.getByTestId("brand-color").getAttribute("data-color")) === "#123abc");
  await page.getByTestId("brand-add-logo").click();
  await page.waitForTimeout(400);
  check("Logo added as a layer", (await page.locator('[data-testid="layer-bar-image"]').count()) === 2);
  check("The new logo layer is selected (to move it)", await page.getByTestId("layer-panel").isVisible());
  await page.getByTestId("layer-done").click();
  await page.getByTestId("tool-more").click();
  await page.getByTestId("tool-brand").click();
  await page.screenshot({ path: `${SHOTS}/p11-05-brand-kit.png` });
  await page.getByTestId("brand-done").click();
  await page.getByTestId("overlay-bar-text").click();
  const firstColor = await page.getByTestId("text-colors").locator("button").first().getAttribute("data-testid");
  check("Brand colour comes first in text colours", firstColor === "text-color-123abc", firstColor);
  await page.getByTestId("overlay-done").click();
  const out5 = await exportMp4();
  const f5 = frame(out5, 1);
  const logo = px(f5, W * 0.86, H * 0.08);
  check("Export: logo top-right", logo[2] > 170 && logo[0] < 80, `rgb(${logo})`);

  // Reload: brand kit still there, and templates add the logo.
  await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-template").waitFor({ timeout: 20000 });
  await page.getByTestId("start-template").click();
  await page.getByTestId("template-city-vlog").click();
  await page.getByTestId("template-field-title").fill("Shaam");
  await page.getByTestId("template-field-area").fill("Gomti");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("template-apply").click()]);
  await chooser.setFiles([GREEN]);
  await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
  await page.getByTestId("layer-bar-image").waitFor({ timeout: 10000 });
  check("After reload: template gets the saved logo", (await page.locator('[data-testid="layer-bar-image"]').count()) === 1);
  await page.getByTestId("tool-more").click();
  await page.getByTestId("tool-brand").click();
  check("After reload: logo + colour still saved", (await page.getByTestId("brand-logo-preview").isVisible()) && (await page.getByTestId("brand-color").count()) === 1);
  check("Logo button shows it is already on", await page.getByTestId("brand-add-logo").isDisabled());

  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/zz-p11-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

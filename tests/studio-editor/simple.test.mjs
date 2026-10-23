// tests/studio-editor/simple.test.mjs
//
// Phase 12 check: simple layout that never breaks on small phones.
//   - On 360×640 and 412×915, with 4 items on the timeline, every panel
//     (Template, Text, Layer, Audio, Brand) stays on screen: the page does not
//     scroll, the header (Export) is visible and the panel gets real room
//   - Many lanes scroll inside the timeline
//   - 5 main tools + "More" (Area, Deal, Layer, Brand)
//   - Text panel is short: style/font/animation behind "More options";
//     keyframe tools only in Pro mode; both remembered after reload
//   - Buttons in the panels are big enough for a thumb (≥ 32 px)
//
// USAGE:
//   npm run build && npx vite preview --port 4173 &
//   node tests/studio-editor/simple.test.mjs [baseUrl]

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "studio-editor-screenshots";
const F = (n) => path.join(here, "fixtures", n);
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const pageErrors = [];

/** Layout facts right now. */
const layout = (page) => page.evaluate(() => {
  const col = document.querySelector('[data-testid="panel-column"]')?.getBoundingClientRect();
  const exp = document.querySelector('[data-testid="open-export"]')?.getBoundingClientRect();
  const stage = document.querySelector('[data-testid="preview-stage"]')?.getBoundingClientRect();
  const scrolled = [document.documentElement, document.body, ...document.querySelectorAll("main, section")].some((e) => e.scrollTop > 0);
  return {
    pageScrolled: scrolled || scrollY > 0,
    exportTop: exp ? Math.round(exp.top) : -999,
    panelRoom: col ? Math.round(Math.min(innerHeight, col.bottom) - Math.max(0, col.top)) : 0,
    panelBottom: col ? Math.round(col.bottom) : 0,
    previewH: stage ? Math.round(stage.height) : 0,
    vh: innerHeight,
  };
});

try {
  for (const [w, h] of [[360, 640], [412, 915]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const tag = `${w}×${h}`;
    await page.goto(`${BASE_URL}/studio/editor`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
    await page.getByTestId("file-input").setInputFiles([F("landscape-6s.webm")]);
    await page.getByTestId("clip-0").waitFor({ timeout: 30000 });

    // Tools: 5 main + More
    const main = await page.getByTestId("add-tools").locator("button").allInnerTexts();
    check(`${tag}: 5 main tools`, main.length === 5 && main.join(",").replace(/\s/g, "") === "Template,Text,Sticker,Audio,More", main.join(", "));
    await page.getByTestId("tool-more").click();
    const more = await page.getByTestId("add-tools").locator("button").allInnerTexts();
    check(`${tag}: More shows Area, Deal, Layer, Brand`, more.join(",").replace(/\s/g, "") === "Area,Deal,Layer,Brand,Back", more.join(", "));
    await page.getByTestId("tool-back").click();
    check(`${tag}: no Move left/right buttons (drag instead)`, (await page.getByTestId("tool-left").count()) === 0 && (await page.getByTestId("tool-right").count()) === 0);

    // Fill the timeline: text, sticker, deal, layer
    for (const k of ["text", "sticker"]) { await page.getByTestId(`tool-${k}`).click(); await page.getByTestId("overlay-done").click(); }
    await page.getByTestId("tool-more").click();
    await page.getByTestId("tool-deal").click();
    await page.getByTestId("overlay-done").click();
    await page.getByTestId("layer-input").setInputFiles([F("red-3s.webm")]);
    await page.getByTestId("layer-panel").waitFor({ timeout: 30000 });
    await page.getByTestId("layer-done").click();
    const tl = await page.getByTestId("timeline-scroll").evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    check(`${tag}: timeline height capped (lanes scroll inside)`, tl.ch <= 200 && (tl.sh > tl.ch || h > 700), `${tl.ch}/${tl.sh}px`);

    const home = await layout(page);
    check(`${tag}: home — page does not scroll, tools on screen`, !home.pageScrolled && home.exportTop >= 0 && home.panelBottom <= home.vh + 1, JSON.stringify(home));
    await page.screenshot({ path: `${SHOTS}/p12-${w}-01-home.png` });

    const panels = [
      ["Template", async () => page.getByTestId("tool-template").click(), "template-close"],
      ["Text", async () => page.getByTestId("overlay-bar-text").click(), "overlay-done"],
      ["Layer", async () => page.getByTestId("layer-bar-video").click(), "layer-done"],
      ["Audio", async () => page.getByTestId("tool-audio").click(), "audio-done"],
      ["Brand", async () => { await page.getByTestId("tool-more").click(); await page.getByTestId("tool-brand").click(); }, "brand-done"],
    ];
    for (const [name, open, close] of panels) {
      await open();
      await page.waitForTimeout(400);
      const l = await layout(page);
      const minRoom = h < 700 ? 160 : 250;
      check(`${tag}: ${name} panel fits (no page scroll, Export visible, ≥${minRoom}px room)`, !l.pageScrolled && l.exportTop >= 0 && l.panelRoom >= minRoom && l.previewH >= h * 0.2, `room ${l.panelRoom}px, preview ${l.previewH}px`);
      if (name === "Text") {
        const small = await page.getByTestId("panel-column").evaluate((col) => [...col.querySelectorAll("button")]
          .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 32 || r.width < 32); })
          .map((b) => b.dataset.testid || b.getAttribute("aria-label") || b.textContent?.trim()));
        check(`${tag}: Text panel buttons ≥ 32 px`, small.length === 0, small.join(", "));
        await page.screenshot({ path: `${SHOTS}/p12-${w}-02-text-simple.png` });
      }
      if (name === "Template") await page.screenshot({ path: `${SHOTS}/p12-${w}-03-template.png` });
      await page.getByTestId(close).click();
    }

    if (w === 412) {
      // Simple text panel → More options → Pro mode, remembered after reload.
      await page.getByTestId("overlay-bar-text").click();
      check("Text simple: style, font and animation hidden at first", !(await page.getByTestId("text-style-box").isVisible()) && !(await page.getByTestId("font-hindi").isVisible()) && !(await page.getByTestId("anim-tab-in").isVisible()));
      check("Text simple: quick styles, text, colours, size visible", (await page.getByTestId("title-breaking").isVisible()) && (await page.getByTestId("overlay-text").isVisible()) && (await page.getByTestId("text-color-ffffff").isVisible()) && (await page.getByTestId("anim-scale").isVisible()));
      check("Text simple: no keyframe tools", (await page.getByTestId("key-toggle").count()) === 0);
      const scrollH = await page.getByTestId("panel-column").evaluate((el) => el.scrollHeight);
      await page.getByTestId("more-options").click();
      check("More options shows style, font, animation", (await page.getByTestId("text-style-box").isVisible()) && (await page.getByTestId("font-hindi").isVisible()) && (await page.getByTestId("anim-tab-in").isVisible()));
      await page.getByTestId("pro-mode").check();
      check("Pro mode shows keyframe tools", await page.getByTestId("key-toggle").isVisible());
      await page.screenshot({ path: `${SHOTS}/p12-412-04-more-pro.png` });
      const scrollH2 = await page.getByTestId("panel-column").evaluate((el) => el.scrollHeight);
      check("Simple text panel is much shorter", scrollH < scrollH2 * 0.6, `${scrollH}px vs ${scrollH2}px with everything`);
      await page.reload();
      await page.getByTestId("import-empty").waitFor({ timeout: 20000 });
      await page.getByTestId("file-input").setInputFiles([F("landscape-6s.webm")]);
      await page.getByTestId("clip-0").waitFor({ timeout: 30000 });
      await page.getByTestId("tool-text").click();
      check("After reload: More + Pro remembered", (await page.getByTestId("text-style-box").isVisible()) && (await page.getByTestId("key-toggle").isVisible()));
      await page.getByTestId("pro-mode").uncheck();
      await page.getByTestId("more-options").click();
    }
    await ctx.close();
  }
  check("No uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  check("Test run", false, err.message.split("\n")[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

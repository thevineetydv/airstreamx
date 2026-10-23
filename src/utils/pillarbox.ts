// utils/pillarbox.ts
//
// Detects "pillarboxed" Shorts: a portrait clip exported inside a
// landscape (16:9) frame with black bars on the left and right. The video
// file is landscape, but the picture is portrait — so the player should
// fill the screen (crop the bars away) instead of showing the whole frame.
//
// How: the auto-generated thumbnail (a real frame of the video) is drawn to
// a small canvas and its left/right edge columns are checked for black.
// Needs the thumbnail host to allow cross-origin reads (CORS). If it does
// not, or anything else is unclear, the answer is `null` = "unknown" and
// the player keeps its normal behaviour.

/** Result of analysing one frame. */
export interface PillarboxResult {
  /** True when the frame has black bars left and right around portrait content */
  pillarbox: boolean;
  /** Width / height of the non-black content inside the frame */
  contentAspect: number;
}

const BLACK_MAX = 30;          // brightest pixel allowed in a "black" column (0–255, JPEG noise)
const MIN_BAR_SHARE = 0.12;    // each bar must be at least 12% of the frame width
const MAX_BAR_IMBALANCE = 0.1; // bars must be roughly equal (centred content)
const CONTENT_MIN_AVG = 18;    // centre must not be black too (fade-in / black frame)
const PORTRAIT_CONTENT_MAX = 0.8; // content narrower than 4:5 counts as portrait

/**
 * Pure analysis of RGBA pixels (canvas ImageData layout).
 * Returns null when the frame gives no clear answer (e.g. fully black).
 */
export function analyzePillarbox(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number
): PillarboxResult | null {
  if (width < 8 || height < 8 || data.length < width * height * 4) return null;

  // Per column: brightest pixel and average brightness
  const colMax = new Array<number>(width).fill(0);
  const colSum = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > colMax[x]) colMax[x] = lum;
      colSum[x] += lum;
    }
  }

  let left = 0;
  while (left < width && colMax[left] <= BLACK_MAX) left++;
  let right = 0;
  while (right < width - left && colMax[width - 1 - right] <= BLACK_MAX) right++;

  const contentCols = width - left - right;
  if (contentCols <= 0) return null; // whole frame black — can't tell

  let contentSum = 0;
  for (let x = left; x < width - right; x++) contentSum += colSum[x];
  const contentAvg = contentSum / (contentCols * height);
  if (contentAvg < CONTENT_MIN_AVG) return null; // dark/black frame — can't tell

  const contentAspect = contentCols / height;
  const barsBigEnough = left >= width * MIN_BAR_SHARE && right >= width * MIN_BAR_SHARE;
  const balanced = Math.abs(left - right) <= width * MAX_BAR_IMBALANCE;

  return {
    pillarbox: barsBigEnough && balanced && contentAspect <= PORTRAIT_CONTENT_MAX,
    contentAspect,
  };
}

/* ── Browser helper with cache ── */

const cache = new Map<string, Promise<boolean | null>>();
const SAMPLE_WIDTH = 64;

/**
 * Is the video behind `thumbUrl` a portrait clip with black side bars?
 * `videoAspect` (width / height of the video file) guards against
 * thumbnails that are not a plain frame of the video (custom or cropped
 * thumbnails): if the image shape differs from the video, returns null.
 */
export function detectPillarbox(thumbUrl: string | undefined, videoAspect: number): Promise<boolean | null> {
  if (!thumbUrl || !(videoAspect > 0)) return Promise.resolve(null);
  const key = `${thumbUrl}|${videoAspect.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = new Promise<boolean | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 5000);
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.onload = () => {
      clearTimeout(timer);
      try {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        if (!imgAspect || Math.abs(imgAspect - videoAspect) / videoAspect > 0.08) return resolve(null);
        const w = SAMPLE_WIDTH;
        const h = Math.max(8, Math.round(w / imgAspect));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const res = analyzePillarbox(ctx.getImageData(0, 0, w, h).data, w, h);
        resolve(res ? res.pillarbox : null);
      } catch {
        resolve(null); // tainted canvas (no CORS) or other failure
      }
    };
    // Separate cache entry from the <img> tags, which load without CORS
    img.src = `${thumbUrl}${thumbUrl.includes("?") ? "&" : "?"}cors=1`;
  });
  cache.set(key, p);
  return p;
}

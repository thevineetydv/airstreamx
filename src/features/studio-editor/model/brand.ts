// Brand kit: the creator's logo + brand colours, saved on this device
// (localStorage). Used by text colour pickers, "Add my logo" and templates.

export interface Brand {
  /** Up to MAX_BRAND_COLORS "#rrggbb" colours. */
  colors: string[];
  /** Logo as a small PNG data URL (max LOGO_MAX px). */
  logo?: string;
  logoWidth?: number;
  logoHeight?: number;
  /** Put the logo on every template automatically. */
  logoOnTemplates: boolean;
}

export const MAX_BRAND_COLORS = 5;
export const LOGO_MAX = 400;
const KEY = "studio-brand-kit";
export const EMPTY_BRAND: Brand = { colors: [], logoOnTemplates: true };

export function readBrand(): Brand {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_BRAND;
    const b = JSON.parse(raw) as Partial<Brand>;
    return {
      colors: Array.isArray(b.colors) ? b.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_BRAND_COLORS) : [],
      logo: typeof b.logo === "string" && b.logo.startsWith("data:image/") ? b.logo : undefined,
      logoWidth: b.logoWidth,
      logoHeight: b.logoHeight,
      logoOnTemplates: b.logoOnTemplates !== false,
    };
  } catch {
    return EMPTY_BRAND;
  }
}

/** Returns false if the browser refused to save (private mode, storage full). */
export function saveBrand(b: Brand): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
    return true;
  } catch {
    return false;
  }
}

/** Shrink a picked logo to at most LOGO_MAX px and keep transparency (PNG). */
export async function logoFromFile(file: File): Promise<{ logo: string; logoWidth: number; logoHeight: number }> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, LOGO_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { logo: c.toDataURL("image/png"), logoWidth: w, logoHeight: h };
}

/** The saved logo as a File (to add it as a picture layer). */
export async function logoFile(b: Brand): Promise<File | null> {
  if (!b.logo) return null;
  const blob = await (await fetch(b.logo)).blob();
  return new File([blob], "brand-logo.png", { type: "image/png" });
}

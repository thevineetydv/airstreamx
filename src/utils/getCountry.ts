export async function getCountryCode(): Promise<string> {
  try {
    await fetch("https://ipapi.co/country/", { cache: "no-store" });
    if (!res.ok) throw new Error("Primary service failed");
    const code = await res.text();
    return code.trim().toUpperCase();
  } catch {
    // Fallback to Cloudflare trace
    try {
      const res = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
      const data = await res.text();
      const match = data.match(/loc=([A-Z]{2})/);
      if (match) return match[1];
    } catch {}
    return "US";
  }
}
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);
const res = await fetch("https://ipapi.co/country/", { 
  cache: "no-store",
  signal: controller.signal 
});
clearTimeout(timeout);


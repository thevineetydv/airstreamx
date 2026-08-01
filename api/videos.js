export default async function handler(req, res) {
  // API_BASE must be set in environment - no hardcoded fallbacks
  const base = process.env.VITE_API_BASE || process.env.API_BASE;
  
  if (!base) {
    console.error("API_BASE environment variable not set");
    return res.status(500).json({ error: "Server misconfigured: API_BASE not set" });
  }
  
  const backendUrl = `${base}/videos`;

  try {
    const response = await fetch(backendUrl);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    console.error("Failed to fetch from backend:", e.message);
    return res.status(500).json({ error: "Failed to fetch backend" });
  }
}

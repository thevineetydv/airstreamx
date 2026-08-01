// ══════════════════════════════════════════════════════════════
// AIRSTREAMX — MISSION CONTROL SYSTEM v2.0
// Enterprise Aerospace Demo — NASA / SpaceX / ISRO ready
// ══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://backend.airstreamx.com";

// ── Types ──────────────────────────────────────────────────────
type Telemetry = {
  missionId: string;
  status: string;
  altitude: number;
  velocity: number;
  acceleration: number;
  fuel: number;
  temperature: number;
  pressure: number;
  pitch: number;
  yaw: number;
  roll: number;
  lat: number;
  lon: number;
  signal: number;
  battery: number;
  timestamp: number;
};

type LogEntry = { time: string; msg: string; type: "ok" | "warn" | "err" | "info" };
type Phase = "PRE-LAUNCH" | "IGNITION" | "MAX-Q" | "MECO" | "STAGING" | "ORBIT" | "ABORTED" | "STOPPED";

const defaultTelemetry: Telemetry = {
  missionId: "AX-DEMO-001", status: "standby",
  altitude: 0, velocity: 0, acceleration: 9.8,
  fuel: 100, temperature: 22, pressure: 101.3,
  pitch: 0, yaw: 0, roll: 0,
  lat: 28.6139, lon: 77.209,
  signal: 98, battery: 100, timestamp: Date.now(),
};

// ── Helpers ────────────────────────────────────────────────────
function fmt(n: number, dec = 1) { return isNaN(n) ? "0" : n.toFixed(dec); }
function fmtTime(s: number) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `T+${h}:${m}:${sec}`;
}
function getPhase(elapsed: number, status: string): Phase {
  if (status === "aborted") return "ABORTED";
  if (status === "stopped") return "STOPPED";
  if (status !== "active") return "PRE-LAUNCH";
  if (elapsed < 10) return "IGNITION";
  if (elapsed < 60) return "MAX-Q";
  if (elapsed < 180) return "MECO";
  if (elapsed < 300) return "STAGING";
  return "ORBIT";
}
const PHASE_COLOR: Record<Phase, string> = {
  "PRE-LAUNCH": "#ffaa00", IGNITION: "#ff6600", "MAX-Q": "#ff3355",
  MECO: "#00aaff", STAGING: "#aa55ff", ORBIT: "#00ff88",
  ABORTED: "#ff3355", STOPPED: "#4a6a8a",
};

// ══════════════════════════════════════════════════════════════
// Attitude Indicator Canvas
// ══════════════════════════════════════════════════════════════
function AttitudeIndicator({ pitch, roll }: { pitch: number; roll: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height, cx = W / 2, cy = H / 2, r = 58;
    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((roll * Math.PI) / 180);
    const ph = pitch * 1.2;
    ctx.fillStyle = "#0a1a3a"; ctx.fillRect(-r, -r - ph, r * 2, r * 2);
    ctx.fillStyle = "#2a1400"; ctx.fillRect(-r, -ph, r * 2, r * 2);
    ctx.strokeStyle = "#ffaa00"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r, -ph); ctx.lineTo(r, -ph); ctx.stroke();
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const y = -ph + i * 12;
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(14, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 26, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,221,255,0.4)"; ctx.lineWidth = 2;
    const ra = (roll * Math.PI) / 180 - Math.PI / 2;
    const px = cx + Math.cos(ra) * (r - 3), py = cy + Math.sin(ra) * (r - 3);
    ctx.fillStyle = "#00ddff"; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1a3050"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
  }, [pitch, roll]);
  return <canvas ref={ref} width={130} height={130} />;
}

// ══════════════════════════════════════════════════════════════
// Trajectory Chart Canvas
// ══════════════════════════════════════════════════════════════
type TPoint = { altitude: number; velocity: number; fuel: number };

function TrajectoryChart({ data, active }: { data: TPoint[]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#050a10"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#0f1e2e"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = "#1a3050"; ctx.font = "9px Courier New";
    ctx.fillText("ALT / VEL / FUEL", 6, 13);
    if (data.length < 2) {
      ctx.fillStyle = "#1a3050"; ctx.font = "11px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(active ? "Collecting telemetry..." : "Awaiting launch command...", W / 2, H / 2);
      ctx.textAlign = "left"; return;
    }
    const n = data.length;
    // Velocity (blue fill)
    ctx.beginPath();
    data.forEach((d, i) => { const x = (i / (n - 1)) * (W - 20) + 10, y = H - 10 - (Math.min(d.velocity, 7800) / 7800) * (H - 20); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo((n - 1) / (n - 1) * (W - 20) + 10, H - 10); ctx.lineTo(10, H - 10); ctx.closePath();
    ctx.fillStyle = "rgba(0,100,200,0.08)"; ctx.fill();
    ctx.beginPath(); ctx.strokeStyle = "#004488"; ctx.lineWidth = 1;
    data.forEach((d, i) => { const x = (i / (n - 1)) * (W - 20) + 10, y = H - 10 - (Math.min(d.velocity, 7800) / 7800) * (H - 20); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    // Altitude (cyan)
    ctx.beginPath(); ctx.strokeStyle = "#00ddff"; ctx.lineWidth = 2;
    data.forEach((d, i) => { const x = (i / (n - 1)) * (W - 20) + 10, y = H - 10 - (Math.min(d.altitude, 420) / 420) * (H - 20); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    // Fuel (orange dashed)
    ctx.beginPath(); ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    data.forEach((d, i) => { const x = (i / (n - 1)) * (W - 20) + 10, y = H - 10 - (d.fuel / 100) * (H - 20); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
    // Live dot
    const last = data[n - 1];
    const lx = (n - 1) / (n - 1) * (W - 20) + 10, ly = H - 10 - (Math.min(last.altitude, 420) / 420) * (H - 20);
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = "#00ddff"; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.strokeStyle = "rgba(0,221,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    // Legend
    ctx.font = "9px Courier New";
    ctx.fillStyle = "#00ddff"; ctx.fillRect(8, H - 22, 8, 2); ctx.fillText("ALT", 20, H - 17);
    ctx.fillStyle = "#004488"; ctx.fillRect(50, H - 22, 8, 2); ctx.fillText("VEL", 62, H - 17);
    ctx.fillStyle = "#ff6600"; ctx.fillRect(92, H - 22, 8, 2); ctx.fillText("FUEL", 104, H - 17);
  }, [data, active]);
  return <canvas ref={ref} width={430} height={280} style={{ width: "100%", display: "block" }} />;
}

// ══════════════════════════════════════════════════════════════
// Metric Card
// ══════════════════════════════════════════════════════════════
function Metric({ label, value, unit, color = "#00ddff", barPct }: {
  label: string; value: string; unit: string; color?: string; barPct?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 1 }}>{label}</span>
      <span style={{ color, fontSize: 20, fontWeight: "bold", lineHeight: 1.1 }}>{value}</span>
      <span style={{ color: "#4a6a8a", fontSize: 10 }}>{unit}</span>
      {barPct !== undefined && (
        <div style={{ height: 2, background: "#0f1e2e", borderRadius: 1, marginTop: 3 }}>
          <div style={{ width: `${Math.min(100, Math.max(0, barPct))}%`, height: "100%", background: color, borderRadius: 1, transition: "width 0.8s" }} />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
export default function MissionConsole() {
  const [t, setT] = useState<Telemetry>(defaultTelemetry);
  const [tData, setTData] = useState<TPoint[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: "00:00:00", msg: "Mission Control System v2.0 initialized", type: "info" },
    { time: "00:00:00", msg: "AX-DEMO-001 telemetry feed connected", type: "info" },
    { time: "00:00:00", msg: "All systems nominal — awaiting launch command", type: "ok" },
  ]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAlertsRef = useRef<Set<string>>(new Set());

  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    setElapsed(e => {
      const h = Math.floor(e / 3600).toString().padStart(2, "0");
      const m = Math.floor((e % 3600) / 60).toString().padStart(2, "0");
      const s = (e % 60).toString().padStart(2, "0");
      setLogs(prev => [...prev.slice(-80), { time: `${h}:${m}:${s}`, msg, type }]);
      return e;
    });
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // ── Polling ────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/mission/telemetry`);
      if (!res.ok) return;
      const data: Telemetry = await res.json();
      setT(data);
      if (data.status === "active") {
        setTData(prev => {
          const next = [...prev, { altitude: data.altitude, velocity: data.velocity, fuel: data.fuel }];
          return next.length > 80 ? next.slice(-80) : next;
        });
        // Phase-based logs (only fire once)
        const phase = getPhase(elapsed, data.status);
        const alertKey = `phase-${phase}`;
        if (!prevAlertsRef.current.has(alertKey)) {
          prevAlertsRef.current.add(alertKey);
          if (phase === "IGNITION") addLog("IGNITION CONFIRMED — all engines nominal", "ok");
          if (phase === "MAX-Q") addLog("MAX-Q zone — nominal structural load", "warn");
          if (phase === "MECO") addLog("MECO — main engines cut off", "ok");
          if (phase === "STAGING") addLog("Stage separation confirmed", "ok");
          if (phase === "ORBIT") addLog("ORBIT INSERTION — mission success", "ok");
        }
        if (data.fuel < 20) {
          const fk = "fuel-20";
          if (!prevAlertsRef.current.has(fk)) { prevAlertsRef.current.add(fk); addLog("CAUTION: fuel reserve below 20%", "warn"); }
        }
        if (data.temperature > 80) {
          const tk = "temp-80";
          if (!prevAlertsRef.current.has(tk)) { prevAlertsRef.current.add(tk); addLog("Thermal: elevated temperature detected", "warn"); }
        }
      }
    } catch { /* backend unreachable — simulation still runs */ }
  }, [elapsed, addLog]);

  // ── Start Mission ──────────────────────────────────────────
  const startMission = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setTData([]);
    prevAlertsRef.current.clear();
    addLog("LAUNCH COMMAND RECEIVED — T-0 confirmed", "ok");
    addLog("Propulsion system ARMED", "ok");
    try { await fetch(`${API_BASE}/mission/start`, { method: "POST" }); } catch { }
    pollRef.current = setInterval(poll, 1000);
    clockRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, [running, poll, addLog]);

  // ── Stop Mission ───────────────────────────────────────────
  const stopMission = useCallback(async () => {
    setRunning(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    addLog("STOP command received — engines shutdown", "warn");
    try { await fetch(`${API_BASE}/mission/stop`, { method: "POST" }); } catch { }
  }, [addLog]);

  // ── Reset Mission ──────────────────────────────────────────
  const resetMission = useCallback(async () => {
    setRunning(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    setElapsed(0); setT(defaultTelemetry); setTData([]);
    prevAlertsRef.current.clear();
    setLogs([{ time: "00:00:00", msg: "Mission reset — all systems nominal", type: "ok" }]);
    try { await fetch(`${API_BASE}/mission/reset`, { method: "POST" }); } catch { }
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
  }, []);

  const phase = getPhase(elapsed, running ? "active" : t.status);
  const phaseColor = PHASE_COLOR[phase];
  const fuelColor = t.fuel > 50 ? "#00ff88" : t.fuel > 20 ? "#ffaa00" : "#ff3355";
  const tempColor = t.temperature > 150 ? "#ff3355" : t.temperature > 80 ? "#ffaa00" : "#00ff88";
  const sigBars = Math.ceil((t.signal / 100) * 5);

  return (
    <div style={{
      background: "#050a10", color: "#c8dff0", fontFamily: "'Courier New', monospace",
      fontSize: 13, minHeight: "100vh", display: "flex", flexDirection: "column",
    }}>
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div style={{
        background: "#0a1520", borderBottom: "1px solid #1a3050",
        padding: "8px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <span style={{ color: "#00ddff", fontSize: 15, fontWeight: "bold", letterSpacing: 2 }}>⬡ AIRSTREAMX MCC</span>
        <span style={{ color: "#2a4a6a" }}>|</span>
        <span style={{ color: "#ffaa00", fontSize: 12, letterSpacing: 1 }}>MISSION: {t.missionId}</span>
        <span style={{ color: "#2a4a6a" }}>|</span>
        <span style={{
          padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: "bold",
          letterSpacing: 1, border: `1px solid ${phaseColor}`,
          background: phaseColor + "22", color: phaseColor,
        }}>{phase}</span>
        <span style={{ color: "#2a4a6a" }}>|</span>
        <span style={{ color: "#4a6a8a", fontSize: 10 }}>
          UPLINK: <span style={{ color: "#00ff88" }}>NOMINAL</span>
        </span>
        <span style={{ color: "#00ddff", fontSize: 13, letterSpacing: 2, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(elapsed)}
        </span>
      </div>

      {/* ── Main Grid ───────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 175px", flex: 1, minHeight: 0 }}>

        {/* LEFT: Primary Telemetry */}
        <div style={{
          borderRight: "1px solid #1a3050", padding: 12,
          display: "flex", flexDirection: "column", gap: 12, overflowY: "auto",
        }}>
          <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 2, borderBottom: "1px solid #1a3050", paddingBottom: 6 }}>PRIMARY TELEMETRY</div>
          <Metric label="ALTITUDE" value={fmt(t.altitude)} unit="km" color="#00ddff" barPct={(t.altitude / 400) * 100} />
          <Metric label="VELOCITY" value={String(Math.round(t.velocity))} unit="m/s" color="#00ff88" barPct={(t.velocity / 7800) * 100} />
          <Metric label="ACCELERATION" value={fmt(t.acceleration)} unit="m/s²" color="#ffaa00" />
          <Metric label="FUEL REMAINING" value={fmt(t.fuel)} unit="%" color={fuelColor} barPct={t.fuel} />
          <Metric label="TEMPERATURE" value={String(Math.round(t.temperature))} unit="°C" color={tempColor} />
          <Metric label="PRESSURE" value={fmt(t.pressure)} unit="kPa" color="#00aaff" />
          <div style={{ borderTop: "1px solid #1a3050", paddingTop: 8 }}>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>COORDINATES</div>
            <div style={{ color: "#4a6a8a", fontSize: 10 }}>LAT</div>
            <div style={{ color: "#00ddff", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmt(t.lat, 6)}°</div>
            <div style={{ color: "#4a6a8a", fontSize: 10, marginTop: 4 }}>LON</div>
            <div style={{ color: "#00ddff", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmt(t.lon, 6)}°</div>
          </div>
        </div>

        {/* CENTER: Chart + Log + Controls */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #1a3050" }}>
          <div style={{ flex: 1, background: "#050a10", minHeight: 280 }}>
            <TrajectoryChart data={tData} active={running} />
          </div>

          {/* Event Log */}
          <div
            ref={logRef}
            style={{
              background: "#020609", borderTop: "1px solid #1a3050",
              padding: "8px 12px", maxHeight: 110, overflowY: "auto",
              fontSize: 10, lineHeight: 1.7, fontFamily: "'Courier New', monospace",
            }}
          >
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.type === "ok" ? "#00ff88" : l.type === "warn" ? "#ffaa00" : l.type === "err" ? "#ff3355" : "#4a6a8a"
              }}>
                [{l.time}] {l.msg}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{
            background: "#0a1520", borderTop: "1px solid #1a3050",
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <button onClick={startMission} disabled={running} style={{
              padding: "6px 20px", borderRadius: 4, border: "1px solid #00ff88",
              background: running ? "#001a0a44" : "#001a0a", color: "#00ff88",
              fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: "bold",
              letterSpacing: 1, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.5 : 1,
            }}>▶ LAUNCH</button>
            <button onClick={stopMission} disabled={!running} style={{
              padding: "6px 20px", borderRadius: 4, border: "1px solid #ff3355",
              background: "#1a0005", color: "#ff3355",
              fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: "bold",
              letterSpacing: 1, cursor: !running ? "not-allowed" : "pointer", opacity: !running ? 0.5 : 1,
            }}>■ STOP</button>
            <button onClick={resetMission} style={{
              padding: "6px 20px", borderRadius: 4, border: "1px solid #00aaff",
              background: "#0a0a1a", color: "#00aaff",
              fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: "bold",
              letterSpacing: 1, cursor: "pointer",
            }}>↺ RESET</button>
            <span style={{ color: "#4a6a8a", fontSize: 10, marginLeft: "auto" }}>
              POLLING: <span style={{ color: running ? "#00ff88" : "#4a6a8a" }}>{running ? "1Hz" : "IDLE"}</span>
            </span>
          </div>
        </div>

        {/* RIGHT: Attitude + Systems */}
        <div style={{
          padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
        }}>
          <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 2, borderBottom: "1px solid #1a3050", paddingBottom: 6 }}>ATTITUDE</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <AttitudeIndicator pitch={t.pitch} roll={t.roll} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { l: "PITCH", v: fmt(t.pitch) + "°" },
              { l: "YAW", v: fmt(t.yaw) + "°" },
              { l: "ROLL", v: fmt(t.roll) + "°" },
              { l: "G-FORCE", v: fmt(t.acceleration / 9.8, 2) + "g" },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: "#0f1e2e", border: "1px solid #1a3050", borderRadius: 4, padding: "5px 8px" }}>
                <div style={{ color: "#4a6a8a", fontSize: 9, letterSpacing: 1 }}>{l}</div>
                <div style={{ color: "#00ddff", fontSize: 12, fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #1a3050", paddingTop: 8 }}>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>SYSTEMS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#4a6a8a", fontSize: 10 }}>SIGNAL</span>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16 }}>
                  {[4, 7, 10, 13, 16].map((h, i) => (
                    <div key={i} style={{ width: 4, height: h, background: i < sigBars ? "#00ff88" : "#1a3050", borderRadius: 1 }} />
                  ))}
                </div>
              </div>
              {[
                { l: "BATTERY", v: fmt(t.battery, 0) + "%", c: t.battery > 50 ? "#00ff88" : "#ffaa00" },
                { l: "PROPULSION", v: running ? "ACTIVE" : "STANDBY", c: running ? "#00ddff" : "#00ff88" },
                { l: "AVIONICS", v: "NOMINAL", c: "#00ff88" },
                { l: "THERMAL", v: t.temperature > 150 ? "WARNING" : t.temperature > 80 ? "ELEVATED" : "NOMINAL", c: tempColor },
                { l: "COMMS", v: "NOMINAL", c: "#00ff88" },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#4a6a8a", fontSize: 10 }}>{l}</span>
                  <span style={{ color: c, fontSize: 10, fontWeight: "bold" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #1a3050", paddingTop: 8 }}>
            <div style={{ color: "#4a6a8a", fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>MISSION PHASE</div>
            <div style={{ color: phaseColor, fontSize: 13, fontWeight: "bold" }}>{phase}</div>
            <div style={{ color: "#4a6a8a", fontSize: 10, marginTop: 3 }}>
              {phase === "PRE-LAUNCH" && "Awaiting T-0"}
              {phase === "IGNITION" && "Engine start sequence"}
              {phase === "MAX-Q" && "Maximum dynamic pressure"}
              {phase === "MECO" && "Main engine cutoff"}
              {phase === "STAGING" && "Stage separation"}
              {phase === "ORBIT" && "Orbital insertion nominal"}
              {phase === "ABORTED" && "Mission terminated"}
              {phase === "STOPPED" && "Engines shutdown"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
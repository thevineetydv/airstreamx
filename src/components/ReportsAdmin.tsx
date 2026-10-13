// components/ReportsAdmin.tsx
//
// Admin Dashboard → "🚩 Reports" tab. Lists video reports from
// GET /api/admin/reports and lets an admin resolve / dismiss them, or hide
// the video (makes it private — reversible from the Videos tab).

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, ExternalLink, EyeOff, Check, X, RefreshCw } from "lucide-react";
import { API_URL } from "../utils/constants";

type Status = "open" | "resolved" | "dismissed" | "all";
type Kind = "" | "content" | "playback";

interface Report {
  id: number;
  kind: "content" | "playback";
  reason: string;
  details: string | null;
  playback: { position?: number; network?: string; downlink?: number; device?: string; user_agent?: string } | null;
  status: "open" | "resolved" | "dismissed";
  reporter_email: string;
  created_at: string;
  resolved_by: string | null;
  video_id: number;
  public_id: string | null;
  title: string;
  uploader_email: string;
  visibility: string;
  open_reports_for_video: number;
}

const REASON_LABELS: Record<string, string> = {
  buffering: "Buffering", wont_play: "Won't play", no_audio: "No sound", av_sync: "A/V out of sync",
  poor_quality: "Poor quality", subtitles: "Subtitles", copyright: "Copyright", sexual: "Sexual content",
  violence: "Violence", hate: "Hate", harassment: "Harassment", child_safety: "Child safety",
  misleading: "Misleading", spam: "Spam", other: "Other",
};
const URGENT = new Set(["child_safety", "sexual", "copyright", "violence"]);

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const fmtTime = (s?: number) =>
  typeof s === "number" ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—";

export default function ReportsAdmin() {
  const [status, setStatus] = useState<Status>("open");
  const [kind, setKind] = useState<Kind>("");
  const [reports, setReports] = useState<Report[]>([]);
  const [openCounts, setOpenCounts] = useState<{ content?: number; playback?: number }>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ status });
      if (kind) q.set("kind", kind);
      const res = await fetch(`${API_URL}/api/admin/reports?${q}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error("Failed to load reports");
      const data = await res.json();
      setReports(data.reports || []);
      setOpenCounts(data.open || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [status, kind]);

  useEffect(() => { load(); }, [load]);

  const update = async (r: Report, next: "resolved" | "dismissed" | "open", hideVideo = false) => {
    if (hideVideo && !window.confirm(`Hide "${r.title}"? It becomes private (only the creator can see it). You can make it public again from the Videos tab.`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/${r.id}`, {
        method: "PUT",
        headers: await authHeaders(),
        body: JSON.stringify({ status: next, hideVideo }),
      });
      if (!res.ok) throw new Error("Update failed");
      await load();
    } catch {
      setError("Could not update the report. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "resolved", "dismissed", "all"] as Status[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${status === s ? "bg-red-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
          >
            {s}
          </button>
        ))}
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          aria-label="Report type"
          className="ml-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-200"
        >
          <option value="">All types</option>
          <option value="content">Content ({openCounts.content ?? 0} open)</option>
          <option value="playback">Playback ({openCounts.playback ?? 0} open)</option>
        </select>
        <button type="button" onClick={load} aria-label="Refresh" className="ml-auto p-2 rounded-full hover:bg-white/10 text-gray-300">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : reports.length === 0 ? (
        <p className="text-center text-gray-500 py-10 text-sm">No {status === "all" ? "" : status} reports 🎉</p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="bg-[#212121] border border-white/5 rounded-xl p-4">
              <div className="flex flex-wrap items-start gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.kind === "content" ? "bg-red-500/15 text-red-300" : "bg-blue-500/15 text-blue-300"}`}>
                  {r.kind === "content" ? "Content" : "Playback"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${URGENT.has(r.reason) ? "bg-yellow-500/20 text-yellow-300" : "bg-white/10 text-gray-300"}`}>
                  {REASON_LABELS[r.reason] || r.reason}
                </span>
                {r.open_reports_for_video > 1 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-gray-300">
                    {r.open_reports_for_video} open reports on this video
                  </span>
                )}
                {r.visibility !== "public" && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-gray-400">{r.visibility}</span>
                )}
                <span className="ml-auto text-[11px] text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
              </div>

              <a
                href={`/watch?v=${r.public_id || r.video_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-white hover:text-red-300"
              >
                {r.title} <ExternalLink size={12} aria-hidden="true" />
              </a>
              <p className="text-xs text-gray-500 mt-0.5">Creator: {r.uploader_email} · Reported by: {r.reporter_email}</p>

              {r.details && <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap break-words">“{r.details}”</p>}

              {r.kind === "playback" && r.playback && (
                <p className="text-xs text-gray-400 mt-2">
                  At {fmtTime(r.playback.position)} · Network: {r.playback.network || "?"}
                  {r.playback.downlink ? ` (${r.playback.downlink} Mbps)` : ""} · {r.playback.device || "?"}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {r.status === "open" ? (
                  <>
                    <button type="button" disabled={busyId === r.id} onClick={() => update(r, "resolved")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50">
                      <Check size={14} aria-hidden="true" /> Resolved
                    </button>
                    <button type="button" disabled={busyId === r.id} onClick={() => update(r, "dismissed")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50">
                      <X size={14} aria-hidden="true" /> Dismiss
                    </button>
                    {r.visibility !== "private" && (
                      <button type="button" disabled={busyId === r.id} onClick={() => update(r, "resolved", true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-red-600/20 text-red-300 hover:bg-red-600/30 disabled:opacity-50">
                        <EyeOff size={14} aria-hidden="true" /> Hide video
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-500 capitalize">{r.status}{r.resolved_by ? ` by ${r.resolved_by}` : ""}</span>
                    <button type="button" disabled={busyId === r.id} onClick={() => update(r, "open")}
                      className="text-xs text-gray-400 underline hover:text-gray-200 disabled:opacity-50">Reopen</button>
                  </>
                )}
                {busyId === r.id && <Loader2 size={14} className="animate-spin text-gray-400 self-center" aria-hidden="true" />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

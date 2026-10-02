// components/ChannelsAdmin.tsx
//
// Admin Dashboard tab: search creators' channels and fix their channel
// name / handle. Uses admin-only backend routes:
//   GET /api/admin/channels?search=&limit=
//   PUT /api/admin/channels/:email   { channelName, handle }

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Pencil, Search, X, Check } from "lucide-react";
import { API_URL } from "../utils/constants";

interface AdminChannel {
  email: string;
  channel_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  video_count: number;
  updated_at: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export default function ChannelsAdmin() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Edit state (one row at a time)
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchChannels = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`${API_URL}/api/admin/channels?${params}`, {
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to load channels (HTTP ${res.status})`);
      setChannels(data.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchChannels(search), 350);
    return () => clearTimeout(t);
  }, [search, fetchChannels]);

  const startEdit = (c: AdminChannel) => {
    setEditingEmail(c.email);
    setEditName(c.channel_name || "");
    setEditHandle(c.handle || "");
    setError("");
    setNotice("");
  };

  const cancelEdit = () => {
    setEditingEmail(null);
    setError("");
  };

  const saveEdit = async (email: string) => {
    const name = editName.trim();
    const handle = editHandle.trim().replace(/^@/, "");
    if (!name) { setError("Channel name cannot be empty."); return; }
    if (name.length > 100) { setError("Channel name: 100 characters maximum."); return; }
    // Same rules as the creator-facing ChannelCustomizationModal
    if (handle) {
      if (handle.length < 3 || handle.length > 30) { setError("Handle: 3–30 characters."); return; }
      if (!/^[a-zA-Z0-9_.]+$/.test(handle)) { setError("Handle: only letters, numbers, _ and . allowed."); return; }
      if (/^[._]/.test(handle) || /[._]$/.test(handle)) { setError("Handle cannot start or end with . or _"); return; }
      if (/[_.]{2}/.test(handle)) { setError("Handle cannot have two consecutive . or _"); return; }
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/admin/channels/${encodeURIComponent(email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ channelName: name, handle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);

      setChannels(prev => prev.map(c => (c.email === email ? { ...c, ...data.channel } : c)));
      setEditingEmail(null);
      setNotice(`Saved: ${name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-5">
      {/* Search */}
      <div className="relative max-w-md mb-4">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email, handle or channel name"
          aria-label="Search channels"
          className="w-full pl-9 pr-3 py-2 bg-[#212121] border border-white/10 rounded-lg text-sm text-white placeholder:text-gray-400 focus:outline-none focus:border-red-500/50"
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>
      )}
      {notice && !error && (
        <p role="status" className="mb-3 text-sm text-emerald-400">{notice}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Loading channels…
        </div>
      ) : channels.length === 0 ? (
        <p className="text-gray-400 text-sm py-8">No channels found.</p>
      ) : (
        <ul className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
          {channels.map(c => {
            const isEditing = editingEmail === c.email;
            return (
              <li key={c.email} className="p-3 sm:p-4 bg-[#181818] flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Avatar + identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {c.avatar_url && !c.avatar_url.startsWith("data:") ? (
                    <img src={c.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div aria-hidden="true" className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {(c.channel_name || c.email)[0]?.toUpperCase()}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
                      <label className="flex-1 min-w-0">
                        <span className="block text-xs text-gray-400 mb-1">Channel name</span>
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          maxLength={100}
                          autoFocus
                          className="w-full px-3 py-1.5 bg-[#212121] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
                        />
                      </label>
                      <label className="sm:w-48">
                        <span className="block text-xs text-gray-400 mb-1">Handle</span>
                        <input
                          value={editHandle}
                          onChange={e => setEditHandle(e.target.value)}
                          maxLength={31}
                          className="w-full px-3 py-1.5 bg-[#212121] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {c.channel_name || <span className="text-gray-400 italic">No name</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.handle ? `@${c.handle} · ` : ""}{c.email} · {c.video_count} video{c.video_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:self-end">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEdit(c.email)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg"
                      >
                        {saving
                          ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                          : <Check aria-hidden="true" className="w-4 h-4" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg"
                      >
                        <X aria-hidden="true" className="w-4 h-4" /> Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      aria-label={`Edit ${c.channel_name || c.email}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg"
                    >
                      <Pencil aria-hidden="true" className="w-4 h-4" /> Edit
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

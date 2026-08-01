import React, { useEffect, useState, useCallback, useRef } from "react";
import { API_URL } from "../utils/constants";

export default function Dashboard() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "created_at",
    direction: "desc",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      // Cancel any in-flight request before starting a new one
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const res = await fetch(`${API_URL}/videos`, {
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();

      // ✅ FIX 1: API returns { videos: [...] }, not a bare array
      // Previously: setVideos(data) → data is an object → videos.filter crashes
      setVideos(Array.isArray(data) ? data : (data.videos ?? []));
      setError(null);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message ?? "Unknown error");
        console.error("Failed to fetch videos:", err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 8000);
    return () => {
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
  }, [fetchVideos]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const processedVideos = React.useMemo(() => {
    // ✅ FIX 2: Guard against videos not being an array (defensive, belt-and-suspenders)
    const safeVideos = Array.isArray(videos) ? videos : [];

    const filtered = safeVideos.filter((v) =>
      // ✅ FIX 3: Guard against missing title field to prevent .toLowerCase() crash
      (v.title ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aVal =
          sortConfig.key === "created_at"
            ? new Date(a[sortConfig.key]).getTime()
            : a[sortConfig.key] ?? "";
        const bVal =
          sortConfig.key === "created_at"
            ? new Date(b[sortConfig.key]).getTime()
            : b[sortConfig.key] ?? "";

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [videos, searchTerm, sortConfig]);

  // ✅ FIX 4: Guard against missing/null status before calling .toLowerCase()
  const getStatusColor = (status: string | undefined | null) => {
    const colors: Record<string, string> = {
      completed: "text-green-400 bg-green-400/10",
      processing: "text-yellow-400 bg-yellow-400/10",
      failed: "text-red-400 bg-red-400/10",
      pending: "text-orange-400 bg-orange-400/10",
    };
    return colors[(status ?? "").toLowerCase()] ?? "text-gray-400 bg-gray-400/10";
  };

  if (loading && videos.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-400 mx-auto mb-4" />
          <p className="text-gray-400">Loading videos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 text-center">
        <p className="text-red-400 mb-4">Error loading videos: {error}</p>
        <button
          onClick={fetchVideos}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-semibold">Your Videos ({videos.length})</h1>

        {videos.length > 0 && (
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:border-red-400 text-gray-300 placeholder-gray-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-gray-800">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <p className="text-gray-400 text-lg">No videos uploaded yet.</p>
          <p className="text-gray-400 text-sm mt-2">Upload your first video to get started!</p>
        </div>
      ) : processedVideos.length === 0 ? (
        <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-gray-800">
          <p className="text-gray-400">No videos match your search.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full text-left text-gray-300">
            <thead className="bg-[#1a1a1a] text-gray-400 uppercase text-sm">
              <tr>
                <th className="p-3">Thumbnail</th>
                <th
                  className="p-3 cursor-pointer hover:text-gray-200 transition-colors select-none"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                    Title
                    {sortConfig.key === "title" && (
                      <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </th>
                <th
                  className="p-3 cursor-pointer hover:text-gray-200 transition-colors select-none"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                    Status
                    {sortConfig.key === "status" && (
                      <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </th>
                <th
                  className="p-3 cursor-pointer hover:text-gray-200 transition-colors select-none"
                  onClick={() => handleSort("created_at")}
                >
                  <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                    Date
                    {sortConfig.key === "created_at" && (
                      <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {processedVideos.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-gray-800 hover:bg-[#202020] transition-colors"
                >
                  <td className="p-3">
                    <div className="relative group">
                      <img
                        src={v.thumbnail}
                        alt={v.title ?? "Video thumbnail"}
                        className="w-32 h-20 object-cover rounded transition-transform group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="80"%3E%3Crect fill="%23333" width="128" height="80"/%3E%3Ctext fill="%23666" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    </div>
                  </td>
                  <td className="p-3 max-w-xs">
                    <p className="truncate font-medium" title={v.title}>
                      {v.title ?? "Untitled"}
                    </p>
                  </td>
                  <td className="p-3">
                    {/* ✅ FIX 4 applied: safe status render */}
                    <span
                      className={`capitalize px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(v.status)}`}
                    >
                      {v.status ?? "unknown"}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-sm">
                    {v.created_at
                      ? new Date(v.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                      : "—"}
                  </td>
                  <td className="p-3">
                    {/* ✅ FIX 5: Only render Watch link if url exists */}
                    {v.url ? (
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 hover:underline transition-colors"
                      >
                        Watch
                      </a>
                    ) : (
                      <span className="text-gray-600 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import { Radio, Eye, ArrowLeft } from 'lucide-react';
import { API_URL } from '../utils/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveStream {
  id: string | number;
  title: string;
  description?: string;
  hls_url: string;
  thumbnail?: string;
  username: string;
  viewers?: number;
  status: 'live' | 'ended';
}

// ─── Component ────────────────────────────────────────────────────────────────

const LiveStreamPage: React.FC = () => {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchStream();
    notifyViewerJoin();

    // Poll viewer count every 15s
    pollRef.current = setInterval(fetchStream, 15000);

    return () => {
      if (pollRef.current) if (pollRef.current) clearInterval(pollRef.current);
      notifyViewerLeave();
    };
  }, [streamId]);

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_URL}/live/${streamId}`);
      if (response.ok) {
        const data = await response.json();
        // API spreads row directly: { success, id, hls_url, username, ... }
        setStream(data);
      }
    } catch (error) {
      console.error('Failed to fetch stream:', error);
    } finally {
      setLoading(false);
    }
  };

  const notifyViewerJoin = async () => {
    try {
      await fetch(`${API_URL}/live/${streamId}/viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join' })
      });
    } catch {}
  };

  const notifyViewerLeave = async () => {
    try {
      await fetch(`${API_URL}/live/${streamId}/viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave' })
      });
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">📡</div>
          <h2 className="text-2xl font-bold text-white mb-2">Stream Not Found</h2>
          <p className="text-gray-400 mb-6">This stream may have ended or doesn't exist.</p>
          <button
            onClick={() => navigate('/live')}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Browse Live Streams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/live')}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft size={20} />
        Back to Live Streams
      </button>

      {/* Video Player
          API returns hls_url (snake_case) — map to `url` which VideoPlayer reads */}
      <VideoPlayer
        video={{
          id:     stream.id,
          url:    stream.hls_url,          // ← was stream.hlsUrl (undefined)
          poster: stream.thumbnail ?? undefined,
          title:  stream.title,
        }}
        autoPlay={true}
      />

      {/* Stream Info */}
      <div className="mt-6 bg-[#0a0000]/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {stream.status !== 'ended' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                  <Radio size={12} />
                  LIVE
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-400">
                <Eye size={16} />
                <span className="font-semibold">{stream.viewers ?? 0} watching</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{stream.title}</h1>
            {stream.description && (
              <p className="text-gray-400">{stream.description}</p>
            )}
          </div>
        </div>

        {/* Streamer Info */}
        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold">
            {stream.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-semibold text-white">{stream.username}</p>
            <p className="text-sm text-gray-400">
              {stream.status === 'ended' ? 'Stream ended' : 'Streaming now'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStreamPage;


// ============================================================
// DeleteVideoModal.tsx
// ============================================================

import { Trash2, X, AlertTriangle } from "lucide-react";
import type { VideoItem } from "../types";

interface DeleteVideoModalProps {
  video:     Pick<VideoItem, "title" | "thumbnail">;
  onClose:   () => void;
  onConfirm: () => void;
}

export function DeleteVideoModal({ video, onClose, onConfirm }: DeleteVideoModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#181818] w-[420px] rounded-xl shadow-xl p-6 relative border border-white/10">
        <button className="absolute right-3 top-3 text-gray-400 hover:text-white" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="flex justify-center mb-3">
          <AlertTriangle className="text-yellow-400" size={40} />
        </div>

        <h2 className="text-xl font-semibold text-center mb-1">Delete Video?</h2>
        <p className="text-center text-gray-400 text-sm mb-5">
          This action is permanent and cannot be undone.
        </p>

        <div className="flex items-center gap-3 bg-[#242424] p-3 rounded-lg mb-6">
          {video.thumbnail && (
            <img src={video.thumbnail} className="w-20 h-12 object-cover rounded" alt="thumbnail" />
          )}
          <div className="text-sm text-gray-300">{video.title}</div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-[#1a0000] hover:bg-gray-600">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-red-600 hover:bg-red-700"
          >
            <Trash2 size={16} /> Delete Forever
          </button>
        </div>
      </div>
    </div>
  );
}


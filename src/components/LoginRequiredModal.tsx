// ============================================================
// LoginRequiredModal.tsx
// ============================================================


interface LoginRequiredModalProps {
  onClose: () => void;
  onLogin: () => void;
}

export function LoginRequiredModal({ onClose, onLogin }: LoginRequiredModalProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
      <div className="bg-[#181818] rounded-2xl p-8 w-[90%] max-w-sm shadow-lg border border-gray-700 text-center">
        <h2 className="text-2xl font-semibold mb-4 text-white">Login Required</h2>
        <p className="text-gray-300 mb-6">Please sign in to upload videos to your AirStream account.</p>
        <div className="flex justify-center gap-4">
          <button onClick={onLogin} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition">
            Login
          </button>
          <button onClick={onClose} className="bg-[#1a0000] hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-md transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


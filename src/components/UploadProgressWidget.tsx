// components/UploadProgressWidget.tsx
//
// Mount this ONCE, at App level (outside any route), so it's visible
// on every page regardless of navigation. It only renders itself when
// there's an upload in progress AND the full modal is closed — clicking
// it reopens the modal, which just resumes showing the same in-progress
// state from UploadContext (nothing restarts).

import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, X } from "lucide-react";
import { useUpload } from "../context/UploadContext";

export default function UploadProgressWidget() {
  const { uploading, isModalOpen, progress, fileName, processingStage, openModal, cancelUpload } = useUpload();

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Cancel this upload? The file won't be saved.")) {
      cancelUpload();
    }
  };

  return (
    <AnimatePresence>
      {uploading && !isModalOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-4 z-[90] w-72 bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <button onClick={openModal} className="w-full text-left p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2 mb-2.5">
              <UploadCloud size={16} className="text-red-400 flex-shrink-0" />
              <span className="text-sm font-medium text-white truncate flex-1">
                {fileName || "Uploading video..."}
              </span>
              <span
                onClick={handleCancelClick}
                className="text-gray-500 hover:text-white flex-shrink-0 p-0.5"
                role="button"
                aria-label="Cancel upload"
              >
                <X size={14} />
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-red-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="truncate">{processingStage || "Uploading..."}</span>
              <span className="flex-shrink-0 ml-2">{progress}%</span>
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

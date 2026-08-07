// context/UploadContext.tsx
//
// Upload progress state lives HERE, not inside UploadModal — this is
// what makes background/minimized uploads possible. The underlying
// XMLHttpRequest keeps running (browsers manage the actual network
// transfer independently of any React component), but without this,
// the PROGRESS DISPLAY was tied to UploadModal's local state and got
// lost the moment the modal unmounted. Closing the modal previously
// had no way to distinguish "hide the UI" from "cancel the upload" —
// this context makes that distinction possible.

import { createContext, useContext, useRef, useState, ReactNode } from "react";

interface UploadContextValue {
  // Modal visibility — single source of truth, so App.tsx, the mini
  // widget, and UploadModal itself all agree on whether the full
  // wizard UI should be showing.
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void; // Just hides the UI. Never touches the xhr.

  // Upload progress — survives the modal unmounting.
  uploading: boolean;
  progress: number;
  uploadSpeed: number;
  timeRemaining: number;
  processingStage: string;
  fileName: string;
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>;

  beginUpload: (xhr: XMLHttpRequest, fileName: string) => void;
  updateProgress: (progress: number, speed: number, timeRemaining: number, stage: string) => void;
  finishUpload: () => void;
  cancelUpload: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [processingStage, setProcessingStage] = useState("");
  const [fileName, setFileName] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const beginUpload = (xhr: XMLHttpRequest, name: string) => {
    xhrRef.current = xhr;
    setUploading(true);
    setFileName(name);
    setProgress(0);
  };

  const updateProgress = (p: number, speed: number, remaining: number, stage: string) => {
    setProgress(p);
    setUploadSpeed(speed);
    setTimeRemaining(remaining);
    setProcessingStage(stage);
  };

  const finishUpload = () => {
    setUploading(false);
    setProgress(0);
    setFileName("");
    xhrRef.current = null;
  };

  const cancelUpload = () => {
    xhrRef.current?.abort();
    finishUpload();
  };

  return (
    <UploadContext.Provider
      value={{
        isModalOpen,
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false),
        uploading,
        progress,
        uploadSpeed,
        timeRemaining,
        processingStage,
        fileName,
        xhrRef,
        beginUpload,
        updateProgress,
        finishUpload,
        cancelUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used within an UploadProvider");
  return ctx;
}

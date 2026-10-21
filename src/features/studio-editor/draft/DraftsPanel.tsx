// Start screen: list of saved drafts (open / delete), and the screen that asks
// for videos that were not stored with a draft.

import { useEffect, useRef, useState } from "react";
import { FileVideo, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { formatTime } from "../model/timeline";
import { deleteDraft, listDrafts, matchFiles, type DraftAssetInfo, type DraftDoc } from "./drafts";

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function DraftsList({ onOpen, busyId }: { onOpen: (id: string) => void; busyId: string | null }) {
  const [drafts, setDrafts] = useState<DraftDoc[] | null>(null);

  useEffect(() => {
    listDrafts().then(setDrafts).catch(() => setDrafts([]));
  }, []);

  if (!drafts?.length) return null;

  const remove = async (d: DraftDoc) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    await deleteDraft(d.id);
    setDrafts((list) => list?.filter((x) => x.id !== d.id) ?? null);
  };

  return (
    <div className="w-full max-w-md px-4" data-testid="drafts-list">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Your drafts</h2>
      <div className="space-y-2">
        {drafts.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2" data-testid="draft-item">
            <button onClick={() => onOpen(d.id)} disabled={!!busyId} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800">
                {d.thumb ? <img src={d.thumb} alt="" className="h-full w-full object-cover" /> : <FileVideo size={18} className="text-gray-500" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{d.name}</div>
                <div className="text-[11px] text-gray-400">
                  {formatTime(d.duration).replace(/\.\d$/, "")} · edited {ago(d.updatedAt)}
                  {!d.mediaSaved && " · videos not stored"}
                </div>
              </div>
            </button>
            {busyId === d.id ? (
              <Loader2 size={18} className="mr-2 animate-spin text-red-400" />
            ) : (
              <button onClick={() => void remove(d)} disabled={!!busyId} className="rounded-full p-2 text-gray-400 hover:text-red-400" aria-label={`Delete ${d.name}`} data-testid="draft-delete">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Drafts are saved on this device only.</p>
    </div>
  );
}

/** Ask for videos that were not stored with the draft. */
export function RelinkPanel(props: {
  missing: DraftAssetInfo[];
  onFiles: (found: Map<string, File>) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const { missing, onFiles, onSkip, onCancel } = props;
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const found = matchFiles(Array.from(files), missing);
    if (!found.size) { setNote("None of these files match. Pick the original videos (same file names)."); return; }
    onFiles(found);
  };

  return (
    <div className="w-full max-w-md space-y-3 px-4" data-testid="relink-panel">
      <h2 className="text-base font-bold">Find the videos for this draft</h2>
      <p className="text-xs text-gray-400">
        There was not enough space on this device to keep {missing.length === 1 ? "this video" : "these videos"} inside the draft.
        Pick the same {missing.length === 1 ? "file" : "files"} again from your phone:
      </p>
      <ul className="space-y-1 text-sm">
        {missing.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <FileVideo size={16} className="text-gray-400" />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className="text-[11px] text-gray-500">{(m.size / 1048576).toFixed(0)} MB</span>
          </li>
        ))}
      </ul>
      {note && <p className="text-xs text-yellow-400">{note}</p>}
      <button onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-3 font-bold" data-testid="relink-pick">
        <FolderOpen size={18} /> Pick files
      </button>
      <div className="flex justify-between text-xs text-gray-400">
        <button onClick={onCancel} className="underline">Back to drafts</button>
        <button onClick={onSkip} className="underline" data-testid="relink-skip">Open without them (their clips are removed)</button>
      </div>
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => pick(e.target.files)} data-testid="relink-input" />
    </div>
  );
}

// Drafts: save the edit on this device and open it again later.
// The project (clips, text, audio settings…) is small JSON. The video files and
// voice-over recordings are stored as blobs next to it, so a draft opens
// without picking the files again. If the browser has no room for the videos,
// the draft is still saved and the files are asked for when it is opened.

import { getAudioContext } from "../audio/context";
import { probeFile } from "../media/probe";
import type { AudioSettings, VoiceOver } from "../model/audio";
import { initialEditorState } from "../model/reducer";
import { newId, totalDuration } from "../model/timeline";
import type { EditorState, MediaAsset } from "../model/types";
import { askPersistentStorage, db, isQuotaError } from "./db";
import { audioBufferToWav } from "./wav";
import { loadImage, type ImageAsset, type Layer } from "../model/layers";

export interface DraftAssetInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  duration: number;
}

export interface DraftDoc {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Video length and a small picture, for the drafts list. */
  duration: number;
  thumb: string | null;
  assets: DraftAssetInfo[];
  clips: EditorState["clips"];
  overlays: EditorState["overlays"];
  aspect: EditorState["aspect"];
  audio: Omit<AudioSettings, "voiceOvers"> & { voiceOvers: { id: string; start: number; volume: number }[] };
  /** False when the browser had no room for the video files. */
  mediaSaved: boolean;
  /** Phase 6b (older drafts have none). */
  layers?: Layer[];
  images?: { id: string; name: string; type: string; lastModified: number }[];
}

export function draftName(at = new Date()): string {
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = at.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  return `Draft · ${day}, ${time}`;
}

export function newDraftMeta() {
  return { id: newId("draft"), name: draftName(), createdAt: Date.now() };
}

const assetKey = (draftId: string, assetId: string) => `${draftId}:${assetId}`;
const voiceKey = (draftId: string, voId: string) => `${draftId}:vo:${voId}`;
const imageKey = (draftId: string, imageId: string) => `${draftId}:img:${imageId}`;

/** Assets used by the main clips and by video layers. */
function usedAssetIds(s: EditorState): Set<string> {
  const ids = new Set(s.clips.map((c) => c.assetId));
  for (const l of s.layers) if (l.kind === "video") ids.add(l.assetId);
  return ids;
}

function toDoc(meta: { id: string; name: string; createdAt: number }, s: EditorState, mediaSaved: boolean): DraftDoc {
  const used = usedAssetIds(s);
  const usedImages = new Set(s.layers.flatMap((l) => (l.kind === "image" ? [l.imageId] : [])));
  const assets = Object.values(s.assets)
    .filter((a) => used.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, size: a.file.size, type: a.file.type, lastModified: a.file.lastModified, duration: a.duration }));
  const first = s.assets[s.clips[0]?.assetId];
  const thumb = first?.thumbs[0]?.url;
  return {
    version: 1,
    ...meta,
    updatedAt: Date.now(),
    duration: totalDuration(s.clips),
    thumb: thumb?.startsWith("data:") ? thumb : null,
    assets,
    clips: s.clips,
    overlays: s.overlays,
    aspect: s.aspect,
    audio: { ...s.audio, voiceOvers: s.audio.voiceOvers.map((v) => ({ id: v.id, start: v.start, volume: v.volume })) },
    mediaSaved,
    layers: s.layers,
    images: Object.values(s.images)
      .filter((i) => usedImages.has(i.id))
      .map((i) => ({ id: i.id, name: i.name, type: i.file.type, lastModified: i.file.lastModified })),
  };
}

/**
 * Save the draft. `saved` remembers which files are already stored, so each
 * video is written only once. Returns false if the videos did not fit.
 */
export async function saveDraft(
  meta: { id: string; name: string; createdAt: number },
  s: EditorState,
  saved: Set<string>,
  mediaOk: boolean,
): Promise<boolean> {
  let ok = mediaOk;
  if (ok) {
    await askPersistentStorage();
    for (const c of usedAssetIds(s)) {
      const key = assetKey(meta.id, c);
      if (saved.has(key)) continue;
      try {
        await db.putMedia(key, s.assets[c].file);
        saved.add(key);
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        ok = false; // keep going: the project itself is tiny and still saved
        break;
      }
    }
  }
  // Pictures and voice-overs are small; always try to keep them.
  for (const l of s.layers) {
    if (l.kind !== "image" || !s.images[l.imageId]) continue;
    const key = imageKey(meta.id, l.imageId);
    if (saved.has(key)) continue;
    try {
      await db.putMedia(key, s.images[l.imageId].file);
      saved.add(key);
    } catch (err) {
      if (!isQuotaError(err)) throw err;
    }
  }
  for (const v of s.audio.voiceOvers) {
    const key = voiceKey(meta.id, v.id);
    if (saved.has(key)) continue;
    try {
      await db.putMedia(key, audioBufferToWav(v.buffer));
      saved.add(key);
    } catch (err) {
      if (!isQuotaError(err)) throw err;
    }
  }
  // Drop recordings that were deleted from the edit.
  const live = new Set(s.audio.voiceOvers.map((v) => voiceKey(meta.id, v.id)));
  for (const k of await db.mediaKeysOf(meta.id)) {
    const key = String(k);
    if (key.startsWith(`${meta.id}:vo:`) && !live.has(key)) {
      await db.delMedia(key);
      saved.delete(key);
    }
  }
  await db.put("projects", toDoc(meta, s, ok));
  return ok;
}

export async function listDrafts(): Promise<DraftDoc[]> {
  const all = await db.all<DraftDoc>("projects");
  return all.filter((d) => d.version === 1).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDraft(id: string): Promise<void> {
  await db.delMediaOf(id);
  await db.del("projects", id);
}

export interface OpenedDraft {
  doc: DraftDoc;
  assets: Record<string, MediaAsset>;
  images: Record<string, ImageAsset>;
  voiceOvers: VoiceOver[];
  /** Videos that were not stored (or could not be read) and must be picked again. */
  missing: DraftAssetInfo[];
}

export async function openDraft(id: string): Promise<OpenedDraft> {
  const doc = await db.get<DraftDoc>("projects", id);
  if (!doc) throw new Error("This draft no longer exists.");
  const assets: Record<string, MediaAsset> = {};
  const missing: DraftAssetInfo[] = [];
  for (const info of doc.assets) {
    const blob = await db.getMedia(assetKey(id, info.id));
    if (!blob) { missing.push(info); continue; }
    try {
      const file = new File([blob], info.name, { type: info.type, lastModified: info.lastModified });
      assets[info.id] = await probeFile(file, info.id);
    } catch {
      missing.push(info);
    }
  }
  const voiceOvers: VoiceOver[] = [];
  for (const v of doc.audio.voiceOvers) {
    const blob = await db.getMedia(voiceKey(id, v.id));
    if (!blob) continue;
    try {
      const buffer = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
      voiceOvers.push({ ...v, buffer });
    } catch { /* skip a damaged recording */ }
  }
  const images: Record<string, ImageAsset> = {};
  for (const info of doc.images ?? []) {
    const blob = await db.getMedia(imageKey(id, info.id));
    if (!blob) continue;
    try {
      images[info.id] = await loadImage(new File([blob], info.name, { type: info.type, lastModified: info.lastModified }), info.id);
    } catch { /* skip a damaged picture */ }
  }
  return { doc, assets, images, voiceOvers, missing };
}

/** Match picked files to missing videos: same name + size first, then same name. */
export function matchFiles(files: File[], missing: DraftAssetInfo[]): Map<string, File> {
  const out = new Map<string, File>();
  for (const m of missing) {
    const f = files.find((x) => x.name === m.name && x.size === m.size) ?? files.find((x) => x.name === m.name);
    if (f) out.set(m.id, f);
  }
  return out;
}

/** Editor state from an opened draft. Clips whose video is still missing are left out. */
export function draftToState(o: OpenedDraft): EditorState {
  const { doc, assets } = o;
  return {
    ...initialEditorState,
    assets,
    clips: doc.clips.filter((c) => assets[c.assetId]),
    overlays: doc.overlays,
    aspect: doc.aspect,
    audio: { ...doc.audio, voiceOvers: o.voiceOvers },
    // Layers whose video / picture is missing are left out.
    layers: (doc.layers ?? []).filter((l) => (l.kind === "video" ? assets[l.assetId] : o.images[l.imageId])),
    images: o.images,
  };
}

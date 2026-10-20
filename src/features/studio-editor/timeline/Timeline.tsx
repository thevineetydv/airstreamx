// Mobile-first timeline: the playhead stays fixed in the centre and the
// clips scroll under it (CapCut style). Scrolling = scrubbing.

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clipDuration, formatTime } from "../model/timeline";
import type { Clip, MediaAsset } from "../model/types";
import { clampOverlayTimes, overlayLabel, type Overlay } from "../model/overlays";

interface TimelineProps {
  clips: Clip[];
  assets: Record<string, MediaAsset>;
  selectedId: string | null;
  time: number;
  duration: number;
  pxPerSec: number;
  onSeek: (t: number) => void;
  onScrubStart: () => void;
  onSelect: (id: string | null) => void;
  onTrim: (id: string, edge: "in" | "out", value: number) => void;
  overlays: Overlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string) => void;
  onOverlayTime: (id: string, start: number, end: number) => void;
}

export default function Timeline(props: TimelineProps) {
  const { clips, assets, selectedId, time, duration, pxPerSec, onSeek, onScrubStart, onSelect, onTrim } = props;
  const { overlays, selectedOverlayId, onSelectOverlay, onOverlayTime } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const expectedScroll = useRef(-1);
  const [half, setHalf] = useState(0);

  // Half of the visible width = the padding that lets t=0 and t=end reach the centre line.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setHalf(Math.round(el.clientWidth / 2));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the scroll position in sync with the playhead time.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.round(time * pxPerSec);
    if (Math.abs(el.scrollLeft - target) > 1) {
      expectedScroll.current = target;
      el.scrollLeft = target;
    }
  }, [time, pxPerSec, half]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Ignore the scroll events we caused ourselves.
    if (expectedScroll.current >= 0 && Math.abs(el.scrollLeft - expectedScroll.current) <= 2) {
      expectedScroll.current = -1;
      return;
    }
    expectedScroll.current = -1;
    onSeek(el.scrollLeft / pxPerSec);
  };

  const tickStep = pxPerSec >= 60 ? 1 : pxPerSec >= 25 ? 2 : pxPerSec >= 12 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += tickStep) ticks.push(t);

  return (
    <div className="relative select-none" data-testid="timeline">
      {/* Fixed centre playhead */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.8)]">
        <div className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onPointerDown={onScrubStart}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="timeline-scroll"
      >
        <div style={{ paddingLeft: half, paddingRight: half }} className="w-max">
          {/* Ruler */}
          <div className="relative h-5" style={{ width: duration * pxPerSec }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-gray-500"
                style={{ left: t * pxPerSec }}
              >
                {formatTime(t).replace(/\.\d$/, "")}
              </span>
            ))}
          </div>

          {/* Clips */}
          <div className="flex h-16 items-stretch gap-0.5" onClick={() => onSelect(null)}>
            {clips.map((clip, i) => (
              <ClipBlock
                key={clip.id}
                clip={clip}
                index={i}
                asset={assets[clip.assetId]}
                selected={clip.id === selectedId}
                pxPerSec={pxPerSec}
                onSelect={onSelect}
                onTrim={onTrim}
              />
            ))}
          </div>

          {/* Overlay track: one bar per overlay, stacked in lanes when they overlap */}
          {overlays.length > 0 && (
            <OverlayTrack
              overlays={overlays}
              selectedId={selectedOverlayId}
              pxPerSec={pxPerSec}
              duration={duration}
              onSelect={onSelectOverlay}
              onTime={onOverlayTime}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<Overlay["kind"], string> = {
  text: "bg-sky-600",
  sticker: "bg-amber-600",
  area: "bg-emerald-600",
  deal: "bg-red-600",
};
const LANE_H = 24;

/** Greedy lane assignment: an overlay goes in the first lane where it does not overlap. */
function assignLanes(overlays: Overlay[]): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const o of [...overlays].sort((a, b) => a.start - b.start)) {
    let lane = laneEnds.findIndex((end) => end <= o.start + 0.001);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = o.end;
    lanes.set(o.id, lane);
  }
  return lanes;
}

function OverlayTrack(props: {
  overlays: Overlay[];
  selectedId: string | null;
  pxPerSec: number;
  duration: number;
  onSelect: (id: string) => void;
  onTime: (id: string, start: number, end: number) => void;
}) {
  const { overlays, selectedId, pxPerSec, duration, onSelect, onTime } = props;
  const lanes = assignLanes(overlays);
  const laneCount = Math.max(1, ...Array.from(lanes.values()).map((l) => l + 1));

  // Drag the whole bar ("move") or one of its edges. Only works on the selected bar,
  // so swiping across other bars still scrolls the timeline.
  const startDrag = (o: Overlay, mode: "move" | "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
    if (o.id !== selectedId) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const { start, end } = o;
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / pxPerSec;
      if (mode === "move") {
        const len = end - start;
        const s = Math.min(Math.max(0, start + dt), Math.max(0, duration - len));
        onTime(o.id, s, s + len);
      } else if (mode === "start") {
        const c = clampOverlayTimes(start + dt, end, duration);
        onTime(o.id, c.start, end);
      } else {
        const c = clampOverlayTimes(start, end + dt, duration);
        onTime(o.id, start, c.end);
      }
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div className="relative mt-1" style={{ width: duration * pxPerSec, height: laneCount * LANE_H }} data-testid="overlay-track">
      {overlays.map((o) => {
        const selected = o.id === selectedId;
        const left = Math.min(o.start, duration) * pxPerSec;
        const width = Math.max(10, (Math.min(o.end, duration) - Math.min(o.start, duration)) * pxPerSec);
        return (
          <div
            key={o.id}
            data-testid={`overlay-bar-${o.kind}`}
            data-selected={selected}
            onClick={(e) => { e.stopPropagation(); onSelect(o.id); }}
            onPointerDown={startDrag(o, "move")}
            className={`absolute flex items-center overflow-hidden rounded-md text-[10px] font-semibold text-white ${KIND_COLOR[o.kind]} ${
              selected ? "z-10 ring-2 ring-white touch-none" : "opacity-80"
            }`}
            style={{ left, width, top: (lanes.get(o.id) ?? 0) * LANE_H, height: LANE_H - 4 }}
          >
            <span className={`truncate ${selected ? "px-4" : "px-1.5"}`}>{overlayLabel(o)}</span>
            {selected && (
              <>
                <div onPointerDown={startDrag(o, "start")} className="absolute inset-y-0 left-0 w-3 cursor-ew-resize bg-white/40" data-testid="overlay-handle-start" />
                <div onPointerDown={startDrag(o, "end")} className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-white/40" data-testid="overlay-handle-end" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ClipBlockProps {
  clip: Clip;
  index: number;
  asset: MediaAsset | undefined;
  selected: boolean;
  pxPerSec: number;
  onSelect: (id: string | null) => void;
  onTrim: (id: string, edge: "in" | "out", value: number) => void;
}

const ClipBlock = memo(function ClipBlock({ clip, index, asset, selected, pxPerSec, onSelect, onTrim }: ClipBlockProps) {
  const width = Math.max(8, clipDuration(clip) * pxPerSec);
  const thumbs = asset?.thumbs ?? [];

  // Pick the nearest thumbnail for each slot along the clip.
  const slots = Math.max(1, Math.round(width / 44));
  const images = thumbs.length
    ? Array.from({ length: slots }, (_, k) => {
        const t = clip.inPoint + ((k + 0.5) / slots) * clipDuration(clip);
        return thumbs.reduce((best, th) => (Math.abs(th.t - t) < Math.abs(best.t - t) ? th : best), thumbs[0]).url;
      })
    : [];

  // Drag a trim handle. Pointer capture keeps the drag alive outside the handle.
  const startDrag = (edge: "in" | "out") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startValue = edge === "in" ? clip.inPoint : clip.outPoint;
    const move = (ev: PointerEvent) => onTrim(clip.id, edge, startValue + (ev.clientX - startX) / pxPerSec);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div
      data-testid={`clip-${index}`}
      data-selected={selected}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      className={`relative flex shrink-0 overflow-hidden rounded-md bg-zinc-800 ${
        selected ? "ring-2 ring-red-500 z-10" : "ring-1 ring-white/10"
      }`}
      style={{ width }}
    >
      {images.map((src, k) => (
        <img key={k} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover opacity-90" />
      ))}
      {!images.length && (
        <span className="m-auto truncate px-2 text-[10px] text-gray-400">{asset?.name}</span>
      )}
      <span
        className={`absolute bottom-0.5 rounded bg-black/60 px-1 text-[10px] tabular-nums text-white ${selected ? "left-6" : "left-1.5"}`}
      >
        {formatTime(clipDuration(clip))}
      </span>

      {selected && (
        <>
          <div
            data-testid="trim-in"
            onPointerDown={startDrag("in")}
            className="absolute inset-y-0 left-0 flex w-5 cursor-ew-resize touch-none items-center justify-center bg-red-500"
          >
            <span className="h-6 w-0.5 rounded bg-white" />
          </div>
          <div
            data-testid="trim-out"
            onPointerDown={startDrag("out")}
            className="absolute inset-y-0 right-0 flex w-5 cursor-ew-resize touch-none items-center justify-center bg-red-500"
          >
            <span className="h-6 w-0.5 rounded bg-white" />
          </div>
        </>
      )}
    </div>
  );
});

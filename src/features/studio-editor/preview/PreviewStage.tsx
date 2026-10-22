// The preview area. A box with the SAME aspect ratio as the exported video,
// holding two <video> elements (clip k plays on element k % 2, so transitions
// can mix them) and a canvas on top for overlays.
// Tap an overlay to select it, drag to move it. Tap empty space to play/pause.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { isActive, type Overlay, type OverlayPatch } from "../model/overlays";
import { drawOverlaysAt, overlayRect } from "../render/drawOverlays";
import { propsAt, type AnimProps } from "../model/keyframes";
import { animatedAt } from "../model/presets";
import { layerActive, layerEnd, layerRect, type ImageAsset, type Layer } from "../model/layers";
import { LAYER_RADIUS } from "../render/drawLayers";
import type { MediaAsset } from "../model/types";
import type { Clip } from "../model/types";
import { clipEnds, clipStarts, frameLayers } from "../model/timeline";
import { clipVideoCss, transitionCss } from "../render/drawClip";
import type { CSSProperties } from "react";

interface Props {
  videoRefs: readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>];
  clips: Clip[];
  /** Output width / height (e.g. 9/16 for portrait). */
  aspect: number;
  time: number;
  overlays: Overlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  /** New position as shown at the playhead (the page turns it into base values or a keyframe). */
  onMoveOverlay: (id: string, patch: OverlayPatch) => void;
  layers: Layer[];
  assets: Record<string, MediaAsset>;
  images: Record<string, ImageAsset>;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onMoveLayer: (id: string, pos: Pick<AnimProps, "x" | "y">) => void;
  playing: boolean;
  /** Silence layer videos (e.g. while recording a voice-over). */
  muted: boolean;
  onTapEmpty: () => void;
  onDragStart: () => void;
}

const TAP_SLOP = 6; // px of movement before a tap becomes a drag

export default function PreviewStage(props: Props) {
  const { videoRefs, clips, aspect, time, overlays, selectedOverlayId, onSelectOverlay, onMoveOverlay, onTapEmpty, onDragStart } = props;
  const { layers, assets, images, selectedLayerId, onSelectLayer, onMoveLayer, playing, muted } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Fit the stage inside the available space, keeping the output aspect ratio.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const w = Math.min(W, H * aspect);
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  // Redraw overlays whenever time, overlays, selection or size change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(box.w * dpr);
    const H = Math.round(box.h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawOverlaysAt(ctx, overlays, time, W, H);

    // Dashed outline around the selected overlay (preview only, never exported).
    const sel = overlays.find((o) => o.id === selectedOverlayId);
    if (sel && isActive(sel, time)) {
      const r = overlayRect(ctx, sel, W, H, time);
      ctx.save();
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(r.x - 3 * dpr, r.y - 3 * dpr, r.w + 6 * dpr, r.h + 6 * dpr);
      ctx.restore();
    }
  }, [box, overlays, time, selectedOverlayId]);

  const sizeOf = (l: Layer) => (l.kind === "video" ? assets[l.assetId] : images[l.imageId]);

  // Topmost visible layer under a point (canvas pixels). Text/stickers are tested first (drawn above).
  const hitLayer = (px: number, py: number, W: number, H: number): Layer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const size = sizeOf(l);
      if (!size || !layerActive(l, time)) continue;
      const a = animatedAt(l, time, layerEnd(l));
      const r = layerRect(size, a.x, a.y, a.scale, W, H);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return l;
    }
    return null;
  };

  // Topmost visible overlay under a point (canvas pixels).
  const hitTest = (px: number, py: number): Overlay | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    for (let i = overlays.length - 1; i >= 0; i--) {
      const o = overlays[i];
      if (!isActive(o, time)) continue;
      const r = overlayRect(ctx, o, canvas.width, canvas.height, time);
      const slop = 8;
      if (px >= r.x - slop && px <= r.x + r.w + slop && py >= r.y - slop && py <= r.y + r.h + slop) return o;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const sx = canvas.width / bounds.width;
    const sy = canvas.height / bounds.height;
    const px = (e.clientX - bounds.left) * sx;
    const py = (e.clientY - bounds.top) * sy;
    const ov = hitTest(px, py);
    const layer = ov ? null : hitLayer(px, py, canvas.width, canvas.height);
    // Drag from where it is SHOWN right now (keyframes applied).
    // (keyframe values only: ready-made animations are not something you drag)
    const from = ov ? propsAt(ov, time - ov.start) : layer ? propsAt(layer, time - layer.start) : null;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    canvas.setPointerCapture(e.pointerId);

    if (ov) onSelectOverlay(ov.id);
    else if (layer) onSelectLayer(layer.id);

    const move = (ev: PointerEvent) => {
      if (!from) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < TAP_SLOP) return;
      if (!dragging) { dragging = true; onDragStart(); }
      const pos = {
        x: Math.min(1, Math.max(0, from.x + dx / bounds.width)),
        y: Math.min(1, Math.max(0, from.y + dy / bounds.height)),
      };
      if (ov) onMoveOverlay(ov.id, pos);
      else if (layer) onMoveLayer(layer.id, pos);
    };
    const up = () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      if (!from) {
        // Tap on empty space: clear selection, play / pause.
        onSelectOverlay(null);
        onSelectLayer(null);
        onTapEmpty();
      }
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  };

  // Which element shows which clip right now, and how (fit/filter/transition).
  const starts = clipStarts(clips);
  const L = frameLayers(clips, time, starts, clipEnds(clips, starts));
  const hidden: CSSProperties = { opacity: 0, zIndex: 0 };
  const slotStyle: [CSSProperties, CSSProperties] = [hidden, hidden];
  let activeSlot = 0;
  if (L) {
    const tc = L.b ? transitionCss(L.type, L.p) : null;
    slotStyle[L.a.index % 2] = { ...clipVideoCss(clips[L.a.index]), zIndex: 1, ...(tc?.a ?? {}) };
    activeSlot = L.a.index % 2;
    if (L.b) {
      slotStyle[L.b.index % 2] = { ...clipVideoCss(clips[L.b.index]), ...tc!.b };
      if (L.p >= 0.5) activeSlot = L.b.index % 2;
    }
  }
  // "Blur" fit: a tiny copy of the visible video, stretched and blurred by CSS (cheap on phones).
  const blurClip = L ? clips[activeSlot === L.a.index % 2 ? L.a.index : L.b!.index] : undefined;
  const wantBlur = blurClip?.fit === "blur";
  const bgRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!wantBlur) return;
    let raf = 0;
    const draw = () => {
      const bg = bgRef.current;
      const v = videoRefs[activeSlot].current;
      const ctx = bg?.getContext("2d");
      if (bg && v && ctx && v.readyState >= 2) {
        const vw = v.videoWidth || 1;
        const vh = v.videoHeight || 1;
        const s = Math.max(bg.width / vw, bg.height / vh);
        ctx.drawImage(v, (bg.width - vw * s) / 2, (bg.height - vh * s) / 2, vw * s, vh * s);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [wantBlur, activeSlot, videoRefs]);

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center">
      <div className="relative overflow-hidden bg-black" style={{ width: box.w, height: box.h }} data-testid="preview-stage">
        {wantBlur && (
          <canvas
            ref={bgRef}
            width={48}
            height={Math.max(1, Math.round(48 / aspect))}
            className="absolute inset-0 h-full w-full"
            style={{ filter: `blur(${Math.round(box.w * 0.03)}px) brightness(0.6) ${blurClip ? clipVideoCss(blurClip).filter ?? "" : ""}`, transform: "scale(1.15)" }}
            data-testid="preview-blur-bg"
          />
        )}
        {[0, 1].map((slot) => (
          <video
            key={slot}
            ref={videoRefs[slot]}
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full"
            style={slotStyle[slot]}
            data-testid={`preview-video-${slot}`}
            data-active={slot === activeSlot}
          />
        ))}
        {/* Layers: positioned <img>/<video> between the main video and the text canvas */}
        {layers.map((l) => {
          const size = sizeOf(l);
          if (!size) return null;
          return (
            <LayerView
              key={l.id}
              layer={l}
              url={size.url}
              size={size}
              time={time}
              box={box}
              playing={playing}
              muted={muted}
              selected={l.id === selectedLayerId}
            />
          );
        })}
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          className="absolute inset-0 z-10 h-full w-full touch-none"
          data-testid="overlay-canvas"
        />
      </div>
    </div>
  );
}

/** One layer in the preview. Videos follow the timeline: seek when paused, play along when playing. */
function LayerView(props: {
  layer: Layer;
  url: string;
  size: { width: number; height: number };
  time: number;
  box: { w: number; h: number };
  playing: boolean;
  muted: boolean;
  selected: boolean;
}) {
  const { layer, url, size, time, box, playing, muted, selected } = props;
  const ref = useRef<HTMLVideoElement>(null);
  const active = layerActive(layer, time);

  useEffect(() => {
    const v = ref.current;
    if (!v || layer.kind !== "video") return;
    v.muted = muted || layer.volume <= 0;
    v.volume = Math.min(1, Math.max(0, layer.volume));
    if (!active) { if (!v.paused) v.pause(); return; }
    const want = layer.inPoint + (time - layer.start);
    if (playing) {
      if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
      if (v.paused) void v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
    }
  });

  const a = animatedAt(layer, time, layerEnd(layer));
  const r = layerRect(size, a.x, a.y, a.scale, box.w, box.h);
  const style: CSSProperties = {
    position: "absolute",
    left: r.x,
    top: r.y,
    width: r.w,
    height: r.h,
    opacity: active ? Math.min(1, a.opacity) : 0,
    visibility: active ? "visible" : "hidden",
    borderRadius: layer.rounded ? Math.min(r.w, r.h) * LAYER_RADIUS : 0,
    objectFit: "fill",
    zIndex: 5,
    pointerEvents: "none",
    outline: selected && active ? "2px dashed #fff" : undefined,
    outlineOffset: 3,
  };
  return layer.kind === "video" ? (
    <video ref={ref} src={url} playsInline preload="auto" style={style} data-testid="preview-layer" data-layer-id={layer.id} />
  ) : (
    <img src={url} alt="" draggable={false} style={style} data-testid="preview-layer" data-layer-id={layer.id} />
  );
}

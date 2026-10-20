// The preview area. A box with the SAME aspect ratio as the exported video,
// holding the <video> and a canvas on top for overlays.
// Tap an overlay to select it, drag to move it. Tap empty space to play/pause.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { isActive, type Overlay, type OverlayPatch } from "../model/overlays";
import { drawOverlaysAt, overlayRect } from "../render/drawOverlays";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Output width / height (e.g. 9/16 for portrait). */
  aspect: number;
  time: number;
  overlays: Overlay[];
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onMoveOverlay: (id: string, patch: OverlayPatch) => void;
  onTapEmpty: () => void;
  onDragStart: () => void;
}

const TAP_SLOP = 6; // px of movement before a tap becomes a drag

export default function PreviewStage(props: Props) {
  const { videoRef, aspect, time, overlays, selectedOverlayId, onSelectOverlay, onMoveOverlay, onTapEmpty, onDragStart } = props;
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
      const r = overlayRect(ctx, sel, W, H);
      ctx.save();
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(r.x - 3 * dpr, r.y - 3 * dpr, r.w + 6 * dpr, r.h + 6 * dpr);
      ctx.restore();
    }
  }, [box, overlays, time, selectedOverlayId]);

  // Topmost visible overlay under a point (canvas pixels).
  const hitTest = (px: number, py: number): Overlay | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    for (let i = overlays.length - 1; i >= 0; i--) {
      const o = overlays[i];
      if (!isActive(o, time)) continue;
      const r = overlayRect(ctx, o, canvas.width, canvas.height);
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
    const hit = hitTest((e.clientX - bounds.left) * sx, (e.clientY - bounds.top) * sy);
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    canvas.setPointerCapture(e.pointerId);

    if (hit) onSelectOverlay(hit.id);

    const move = (ev: PointerEvent) => {
      if (!hit) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < TAP_SLOP) return;
      if (!dragging) { dragging = true; onDragStart(); }
      onMoveOverlay(hit.id, {
        x: Math.min(1, Math.max(0, hit.x + dx / bounds.width)),
        y: Math.min(1, Math.max(0, hit.y + dy / bounds.height)),
      });
    };
    const up = () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      if (!hit) {
        // Tap on empty space: clear selection, play / pause.
        onSelectOverlay(null);
        onTapEmpty();
      }
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  };

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center">
      <div className="relative overflow-hidden bg-black" style={{ width: box.w, height: box.h }} data-testid="preview-stage">
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-contain"
          data-testid="preview-video"
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          className="absolute inset-0 h-full w-full touch-none"
          data-testid="overlay-canvas"
        />
      </div>
    </div>
  );
}

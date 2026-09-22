"use client";

// Signature pad for the Service Report customer acknowledgment.
//
// - Mouse, touch, stylus and pen: unified pointer events (pointerdown/move/up)
//   plus touch-move prevention and touch-action:none so the page never scrolls
//   while drawing.
// - Black strokes on a white background.
// - Clear and Redraw actions.
// - Strokes are stored in unit coordinates (0..1) so orientation/resize only
//   re-renders the canvas at the new device resolution — the drawing survives.
// - Exports a PNG File once drawing stops; rejects empty and very short
//   accidental marks before the payload leaves the device.

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Paintbrush } from "lucide-react";

export interface SignaturePadState {
  /** PNG File ready to attach, or null while empty / being edited. */
  png: File | null;
  /** True when the drawing passes the client-side meaningfulness gate. */
  hasMeaningfulInk: boolean;
  /** True when the canvas holds no ink at all. */
  isEmpty: boolean;
  /** Human-readable validation message when hasMeaningfulInk is false. */
  hint: string;
}

export interface ServiceReportSignaturePadProps {
  onStateChange: (state: SignaturePadState) => void;
  disabled?: boolean;
  className?: string;
}

interface Point {
  x: number; // 0..1 relative to css width
  y: number; // 0..1 relative to css height
}

const MIN_POINTS = 12;
const MIN_STROKE_LENGTH_CSS = 48;
const MIN_BBOX_DIAGONAL_CSS = 24;

export function ServiceReportSignaturePad({
  onStateChange,
  disabled = false,
  className,
}: ServiceReportSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef<Point[] | null>(null);
  const sizeRef = useRef<{ cssW: number; cssH: number; dpr: number }>({ cssW: 0, cssH: 0, dpr: 1 });

  const emitState = (state: SignaturePadState) => {
    onStateChange(state);
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { cssW, dpr } = sizeRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, cssW * 0.004) * dpr;
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * canvas.width, stroke[i].y * canvas.height);
      }
      ctx.stroke();
    }
  };

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    // The wrapper also contains the action buttons. Measuring it here makes
    // the canvas height include those buttons; updating the backing canvas
    // then changes the wrapper height again and can cause an endless growth
    // loop through ResizeObserver. Keep the signing surface at its CSS-sized
    // dimensions instead.
    const cssW = Math.max(120, canvas.clientWidth);
    const cssH = Math.max(120, canvas.clientHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    sizeRef.current = { cssW, cssH, dpr };
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    redraw();
  }, []);

  const metricSummary = (): { lengthCss: number; points: number; diagCss: number } => {
    let lengthCss = 0;
    let points = 0;
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    const cssW = sizeRef.current.cssW || 1;
    const cssH = sizeRef.current.cssH || 1;
    for (const stroke of strokesRef.current) {
      for (let i = 0; i < stroke.length; i++) {
        points++;
        const p = stroke[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1];
        const b = stroke[i];
        lengthCss += Math.hypot((b.x - a.x) * cssW, (b.y - a.y) * cssH);
      }
    }
    const diagCss = points === 0 ? 0 : Math.hypot((maxX - minX) * cssW, (maxY - minY) * cssH);
    return { lengthCss, points, diagCss };
  };

  const commitState = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { points, lengthCss, diagCss } = metricSummary();
    const isEmpty = points === 0;
    let hasMeaningfulInk = false;
    let hint = "";
    if (isEmpty) {
      hint = "Draw your signature in the box above.";
    } else if (points < MIN_POINTS || lengthCss < MIN_STROKE_LENGTH_CSS || diagCss < MIN_BBOX_DIAGONAL_CSS) {
      hint = "Your signature looks too short. Draw your full signature, then try again.";
    } else {
      hasMeaningfulInk = true;
      hint = "";
    }

    let png: File | null = null;
    if (hasMeaningfulInk) {
      png = await canvasPngFile(canvas);
      if (!png) hasMeaningfulInk = false;
    }
    emitState({ png, hasMeaningfulInk, isEmpty, hint });
  };

  // Observe the wrapper so viewport rotation / sidebar toggles re-render the
  // canvas at the new device resolution without losing the unit strokes.
  useEffect(() => {
    resizeCanvas();
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort on older clients
    }
    const stroke: Point[] = [];
    strokesRef.current.push(stroke);
    drawingRef.current = stroke;
    addPoint(e);
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || drawingRef.current === null) return;
    e.preventDefault();
    addPoint(e);
    redraw();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current === null) return;
    e.preventDefault();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    drawingRef.current = null;
    void commitState();
  };

  const addPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const stroke = drawingRef.current;
    if (!canvas || !stroke) return;
    const rect = canvas.getBoundingClientRect();
    const { cssW, cssH } = sizeRef.current;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / (cssW || 1)));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / (cssH || 1)));
    stroke.push({ x, y });
  };

  const clear = () => {
    if (disabled) return;
    strokesRef.current = [];
    drawingRef.current = null;
    redraw();
    emitState({ png: null, hasMeaningfulInk: false, isEmpty: true, hint: "Draw your signature in the box above." });
  };

  const redrawAction = () => {
    clear();
    canvasRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={"space-y-2 " + (className ?? "")}>
      <div className="overflow-hidden rounded-md border border-input bg-white">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full select-none sm:h-56"
          style={{
            touchAction: "none",
            overscrollBehavior: "contain",
            WebkitUserSelect: "none",
            msUserSelect: "none",
            WebkitTapHighlightColor: "transparent",
            cursor: "crosshair",
          }}
          aria-label="Customer signature canvas. Draw your signature with a finger, stylus, or mouse."
          aria-disabled={disabled}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            if (drawingRef.current !== null) {
              // A cancelled stroke is almost always a palm/scroll accident — drop it.
              strokesRef.current.pop();
              drawingRef.current = null;
              redraw();
              void commitState();
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          onTouchMove={(e) => {
            if (drawingRef.current !== null) e.preventDefault();
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled} className="h-8 px-2 text-xs">
          <Eraser className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={redrawAction} disabled={disabled} className="h-8 px-2 text-xs">
          <Paintbrush className="mr-1 h-3.5 w-3.5" /> Redraw
        </Button>
      </div>
    </div>
  );
}

/** Exports the canvas pixels as a PNG File (toBlob primary, toDataURL fallback). */
async function canvasPngFile(canvas: HTMLCanvasElement): Promise<File | null> {
  const canvasWithBlob = canvas as HTMLCanvasElement & {
    toBlob?: (type: string, encoderOptions?: unknown) => Promise<Blob>;
  };
  const canvasWithDataUrl = canvas as HTMLCanvasElement & {
    toDataURL?: (type?: string) => string;
  };
  try {
    if (typeof canvasWithBlob.toBlob === "function") {
      const blob = await canvasWithBlob.toBlob("image/png");
      return new File([blob], "signature.png", { type: "image/png" });
    }
  } catch {
    // fall through to the data-URL path below
  }
  try {
    const dataUrl = typeof canvasWithDataUrl.toDataURL === "function"
      ? canvasWithDataUrl.toDataURL("image/png")
      : canvas.toDataURL();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], "signature.png", { type: "image/png" });
  } catch {
    return null;
  }
}

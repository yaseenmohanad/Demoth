"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { XIcon, ZoomInIcon, ZoomOutIcon } from "./Icons";

interface Props {
  /** The original image (data URL or remote URL) the user picked. */
  src: string;
  onCancel: () => void;
  /** Called with the final cropped/positioned JPEG data URL. */
  onSave: (dataUrl: string) => void;
}

/** Size in CSS pixels of the square crop preview (and the output JPEG). */
const SIZE = 280;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

interface Transform {
  tx: number;
  ty: number;
  scale: number;
  rotate: number;
}

/**
 * "Set up your profile picture" modal. Shows the chosen image inside a
 * circular crop guide. Drag to pan, slider/wheel to zoom, slider to rotate.
 * On save, bakes the current transform into a square JPEG data URL.
 */
export default function AvatarCropModal({ src, onCancel, onSave }: Props) {
  const [t, setT] = useState<Transform>({
    tx: 0,
    ty: 0,
    scale: 1,
    rotate: 0,
  });
  const [imgDim, setImgDim] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origTx: number;
    origTy: number;
  } | null>(null);

  // Cover-fit the image to the crop box once we know its natural size.
  useEffect(() => {
    if (!imgDim) return;
    const cover = Math.max(SIZE / imgDim.w, SIZE / imgDim.h);
    setT((prev) => ({ ...prev, scale: cover, tx: 0, ty: 0, rotate: 0 }));
  }, [imgDim]);

  // Esc to cancel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origTx: t.tx,
      origTy: t.ty,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    setT((prev) => ({
      ...prev,
      tx: dragRef.current!.origTx + (e.clientX - dragRef.current!.startX),
      ty: dragRef.current!.origTy + (e.clientY - dragRef.current!.startY),
    }));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    // Zoom with mouse wheel
    const delta = -e.deltaY * 0.001;
    setT((prev) => ({
      ...prev,
      scale: clamp(prev.scale * (1 + delta), MIN_SCALE, MAX_SCALE),
    }));
  }

  async function handleSave() {
    if (!imgDim || saving) return;
    setSaving(true);
    try {
      const img = await loadImage(src);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      // Mirror the CSS transforms used for the live preview.
      ctx.translate(SIZE / 2 + t.tx, SIZE / 2 + t.ty);
      ctx.rotate((t.rotate * Math.PI) / 180);
      ctx.scale(t.scale, t.scale);
      ctx.drawImage(img, -imgDim.w / 2, -imgDim.h / 2);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      onSave(dataUrl);
    } catch {
      // fall back: keep the modal open
      setSaving(false);
    }
  }

  const cssTransform = `translate(${t.tx}px, ${t.ty}px) rotate(${t.rotate}deg) scale(${t.scale})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">Set up your photo</h3>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Drag to position, use the sliders to zoom and rotate. Only what&apos;s
          inside the circle will be saved.
        </p>

        {/* Crop area */}
        <div
          className="relative mx-auto select-none overflow-hidden rounded-xl bg-[var(--background)]"
          style={{
            width: SIZE,
            height: SIZE,
            touchAction: "none",
            cursor: dragRef.current ? "grabbing" : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            // We center the image with flex, then apply the user's
            // (tx, ty, rotate, scale) on top. Canvas export below uses
            // the same math.
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setImgDim({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              style={{
                transform: cssTransform,
                transformOrigin: "center center",
                userSelect: "none",
                maxWidth: "none",
                maxHeight: "none",
              }}
            />
          </div>
          {/* Circular mask + dashed guide */}
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="pointer-events-none absolute inset-0"
            aria-hidden
          >
            <defs>
              <mask id="avatar-crop-hole">
                <rect width={SIZE} height={SIZE} fill="white" />
                <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4} fill="black" />
              </mask>
            </defs>
            <rect
              width={SIZE}
              height={SIZE}
              fill="rgba(255,255,255,0.55)"
              mask="url(#avatar-crop-hole)"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={SIZE / 2 - 4}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          </svg>
        </div>

        {/* Zoom slider */}
        <label className="flex items-center gap-2 text-xs">
          <ZoomOutIcon size={16} className="text-[var(--muted)]" />
          <input
            aria-label="Zoom"
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            value={t.scale}
            onChange={(e) =>
              setT((prev) => ({ ...prev, scale: Number(e.target.value) }))
            }
            className="flex-1 accent-[var(--primary)]"
          />
          <ZoomInIcon size={16} className="text-[var(--muted)]" />
        </label>

        {/* Rotation slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-[var(--muted)]">
              Rotation
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              {Math.round(t.rotate)}°
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label="Rotation"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={t.rotate}
              onChange={(e) =>
                setT((prev) => ({ ...prev, rotate: Number(e.target.value) }))
              }
              className="flex-1 accent-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => setT((prev) => ({ ...prev, rotate: 0 }))}
              className="rounded-lg bg-[var(--background)] px-2 py-1 text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--primary)]"
              title="Reset rotation"
            >
              0°
            </button>
            <button
              type="button"
              onClick={() =>
                setT((prev) => ({ ...prev, rotate: prev.rotate - 90 }))
              }
              className="rounded-lg bg-[var(--background)] px-2 py-1 text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--primary)]"
              title="Rotate left 90°"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={() =>
                setT((prev) => ({ ...prev, rotate: prev.rotate + 90 }))
              }
              className="rounded-lg bg-[var(--background)] px-2 py-1 text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--primary)]"
              title="Rotate right 90°"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!imgDim || saving}
            onClick={handleSave}
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Set as profile picture"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-white px-4 py-2 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--border)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

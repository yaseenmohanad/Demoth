"use client";

/**
 * Client-side helpers for the ML drawing recogniser. The actual model
 * inference runs server-side (via /api/recognize-drawing → Hugging Face
 * Inference API). This file is just the glue:
 *   - render the stroke to a small PNG
 *   - post that PNG and read back the predictions
 *
 * If HF_TOKEN isn't configured on the deploy, the API returns 503 and we
 * resolve with an empty list — the studio falls back to its template
 * matcher silently.
 */

export interface MLPrediction {
  /** Human-readable label (e.g. "moon", "B", "shopping cart"). */
  label: string;
  /** 0..1 confidence from the model. */
  score: number;
  /** True when the prediction came from the OCR model (looks like a letter). */
  isText?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Render a stroke's points into a 224×224 PNG image. White background,
 * black line — matches what the sketch classifier expects. Returns a
 * base64-encoded payload (without the `data:` prefix) ready for POSTing.
 */
export function strokeToPng(points: Point[], size = 224): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);

  if (points.length < 2) return canvas.toDataURL("image/png").split(",")[1];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  // Fit inside size with ~10% padding
  const pad = size * 0.1;
  const fit = size - 2 * pad;
  const scale = Math.min(fit / w, fit / h);
  const drawW = w * scale;
  const drawH = h * scale;
  const offX = (size - drawW) / 2;
  const offY = (size - drawH) / 2;

  ctx.strokeStyle = "black";
  ctx.lineWidth = Math.max(2, size * 0.025);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = (points[i].x - minX) * scale + offX;
    const py = (points[i].y - minY) * scale + offY;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * Send the rendered stroke to the API and return the predictions.
 * Resolves to an empty list when ML recognition is unavailable (503),
 * so the studio can silently fall back to its template matcher.
 */
export async function recognizeDrawing(points: Point[]): Promise<MLPrediction[]> {
  const image = strokeToPng(points);
  if (!image) return [];
  try {
    const res = await fetch("/api/recognize-drawing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { predictions?: MLPrediction[] };
    return Array.isArray(data.predictions) ? data.predictions : [];
  } catch {
    return [];
  }
}

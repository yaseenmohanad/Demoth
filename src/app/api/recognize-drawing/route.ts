import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recognise a user's hand-drawing using Hugging Face's free Inference API.
 * Returns a list of plausible labels in descending confidence order.
 *
 * Pipeline:
 *   1. Sketch classifier — tells us what kind of doodle this is
 *      ("face", "tree", "eye", "house", "lightning bolt", …).
 *   2. Handwritten-character recogniser (TrOCR) — tells us if the drawing
 *      looks like a letter or short word.
 *
 * Both calls run in parallel; results are merged.
 *
 * Free tier: ~30,000 requests/month with an HF_TOKEN, lower without.
 * If HF_TOKEN isn't configured, the route returns 503 — the studio
 * silently falls back to its template matcher.
 */

interface Prediction {
  /** Human-readable label (e.g. "moon", "B", "shopping cart"). */
  label: string;
  /** 0..1 confidence reported by the model. */
  score: number;
  /** Whether this looks like a letter / short text. */
  isText?: boolean;
}

const SKETCH_MODEL = "kmewhort/beit-sketch-classifier";
const OCR_MODEL = "microsoft/trocr-base-handwritten";

interface SketchHFResponse {
  label: string;
  score: number;
}

async function callHF(
  model: string,
  bytes: Uint8Array,
  token: string
): Promise<unknown> {
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    // Hand TS a fresh ArrayBuffer so it accepts the BodyInit.
    body: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer,
  });
  if (!res.ok) {
    // HF returns 503 with `estimated_time` when a model is loading — that's
    // not really a failure, just "try again in a moment".
    const body = await res.text();
    throw new Error(`HF ${model} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function POST(request: Request) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "HF_TOKEN env var not set. Free recognition needs a Hugging Face access token — see README.",
      },
      { status: 503 }
    );
  }

  let body: { image?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const base64 = (body.image ?? "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return NextResponse.json({ error: "Bad base64" }, { status: 400 });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty image" }, { status: 400 });
  }

  // Run sketch classification and OCR in parallel — they don't depend on
  // each other, so latency is max(sketch, ocr) instead of sum.
  const [sketchResult, ocrResult] = await Promise.allSettled([
    callHF(SKETCH_MODEL, bytes, token),
    callHF(OCR_MODEL, bytes, token),
  ]);

  const predictions: Prediction[] = [];
  const errors: string[] = [];

  if (sketchResult.status === "fulfilled") {
    const raw = sketchResult.value;
    if (Array.isArray(raw)) {
      for (const item of raw as SketchHFResponse[]) {
        if (typeof item?.label === "string" && typeof item?.score === "number") {
          predictions.push({ label: item.label, score: item.score });
        }
      }
    }
  } else {
    errors.push(`sketch: ${(sketchResult.reason as Error)?.message ?? "fail"}`);
  }

  if (ocrResult.status === "fulfilled") {
    const raw = ocrResult.value as Array<{ generated_text: string }> | { generated_text: string };
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const item of arr) {
      const text = String(item?.generated_text ?? "").trim();
      if (!text) continue;
      // TrOCR always returns *something* — even for shape drawings it'll
      // hallucinate a string. We only surface it as a letter suggestion
      // when it's 1-4 chars and contains a letter; otherwise treat it as
      // noise.
      if (text.length <= 4 && /[A-Za-z0-9]/.test(text)) {
        predictions.push({ label: text, score: 0.75, isText: true });
      }
    }
  } else {
    errors.push(`ocr: ${(ocrResult.reason as Error)?.message ?? "fail"}`);
  }

  // De-dupe by lowercased label, keeping the highest score.
  const byKey = new Map<string, Prediction>();
  for (const p of predictions) {
    const key = p.label.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || prev.score < p.score) byKey.set(key, p);
  }
  const out = Array.from(byKey.values()).sort((a, b) => b.score - a.score);

  return NextResponse.json({ predictions: out, errors });
}

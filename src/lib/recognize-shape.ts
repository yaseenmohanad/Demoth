/**
 * Hand-drawn shape recogniser, $1-style. Takes the points of a freehand
 * stroke and ranks how closely it resembles each of our canonical shape
 * templates (circle, square, triangle, diamond, heart, star…). The studio
 * shows the top few as suggestions; nothing happens silently.
 *
 * The pipeline matches the original $1 Unistroke Recogniser:
 *   1. Resample the stroke to N points (so length doesn't bias matching).
 *   2. Rotate so the first point sits at angle 0 from the centroid
 *      (rotation invariance).
 *   3. Scale to fit a unit bounding box.
 *   4. Translate centroid to origin.
 *   5. Score against each template by average corresponding-point distance.
 */
import type { ShapeVariant } from "./types";

export interface Point {
  x: number;
  y: number;
}

const N_POINTS = 48;

// ---- preprocessing ----

function pathLength(points: Point[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += dist(points[i - 1], points[i]);
  return n;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function resample(points: Point[], n: number): Point[] {
  if (points.length < 2) return points.slice();
  const total = pathLength(points);
  if (total === 0) return [points[0], points[0]];
  const step = total / (n - 1);
  const out: Point[] = [{ x: points[0].x, y: points[0].y }];
  let prev = points[0];
  let acc = 0;
  let i = 1;
  while (out.length < n && i < points.length) {
    const curr = points[i];
    const d = dist(prev, curr);
    if (acc + d >= step) {
      const remaining = step - acc;
      const t = remaining / d;
      const nx = prev.x + t * (curr.x - prev.x);
      const ny = prev.y + t * (curr.y - prev.y);
      out.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      acc = 0;
    } else {
      acc += d;
      prev = curr;
      i++;
    }
  }
  while (out.length < n) out.push({ ...points[points.length - 1] });
  return out;
}

export function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function translateToOrigin(points: Point[]): Point[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

export function indicativeAngle(points: Point[]): number {
  return Math.atan2(points[0].y, points[0].x);
}

export function rotateBy(points: Point[], rad: number): Point[] {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}

export function scaleToUnit(points: Point[]): Point[] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const s = Math.max(w, h);
  return points.map((p) => ({ x: ((p.x - minX) / s - 0.5), y: ((p.y - minY) / s - 0.5) }));
}

export function preprocess(points: Point[]): Point[] {
  const resampled = resample(points, N_POINTS);
  const scaled = scaleToUnit(resampled);
  const centered = translateToOrigin(scaled);
  const angle = indicativeAngle(centered);
  return rotateBy(centered, -angle);
}

// ---- templates ----

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

function genCircle(): Point[] {
  return Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(t), y: Math.sin(t) };
  });
}

function genPolygon(sides: number, startAngle = -Math.PI / 2): Point[] {
  const corners = Array.from({ length: sides }, (_, i) => {
    const a = startAngle + (i / sides) * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
  const out: Point[] = [];
  const perSide = Math.floor(96 / sides);
  for (let i = 0; i < sides; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % sides];
    for (let j = 0; j < perSide; j++) out.push(lerp(a, b, j / perSide));
  }
  return out;
}

function genHeart(): Point[] {
  // Parametric heart curve (x = 16 sin³ t, y = -(13 cos t - 5 cos 2t - 2 cos 3t - cos 4t))
  return Array.from({ length: 96 }, (_, i) => {
    // Start at the top notch by offsetting t a bit
    const t = (i / 96) * Math.PI * 2 + Math.PI;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    return { x: x / 17, y: y / 17 };
  });
}

function genStar(): Point[] {
  // 5-point star — alternating outer (r=1) / inner (r≈0.4) corners
  const corners: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    corners.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  const out: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < 10; j++) out.push(lerp(a, b, j / 10));
  }
  return out;
}

interface Template {
  variant: ShapeVariant;
  /** Pre-processed (resampled, scaled, centred, rotated) point list. */
  points: Point[];
}

const RAW_TEMPLATES: Array<{ variant: ShapeVariant; points: Point[] }> = [
  { variant: "circle", points: genCircle() },
  { variant: "square", points: genPolygon(4, -Math.PI / 4) }, // start at top-right
  { variant: "triangle", points: genPolygon(3) },
  { variant: "diamond", points: genPolygon(4) }, // start at top
  { variant: "pentagon", points: genPolygon(5) },
  { variant: "hexagon", points: genPolygon(6) },
  { variant: "star", points: genStar() },
  { variant: "heart", points: genHeart() },
];

const TEMPLATES: Template[] = RAW_TEMPLATES.map((t) => ({
  variant: t.variant,
  points: preprocess(t.points),
}));

// ---- matching ----

function avgDistance(a: Point[], b: Point[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += dist(a[i], b[i]);
  return total / a.length;
}

export interface ShapeMatch {
  variant: ShapeVariant;
  /** 0..1 where 1 is a perfect match. */
  score: number;
}

/**
 * Recognise a freehand stroke. Returns templates sorted by descending
 * score. The studio shows the top few that clear a confidence threshold.
 */
export function recognizeShape(points: Point[]): ShapeMatch[] {
  if (points.length < 4) return [];
  const processed = preprocess(points);
  // Compare candidate (rotated to its own indicative angle) against
  // templates (rotated to theirs). For shapes with rotational symmetry
  // (square, circle, …) this gives rotation invariance.
  return TEMPLATES.map((t) => {
    const d = avgDistance(processed, t.points);
    // Map distance → score. avg distance ~0 = great match, ~0.5 = bad.
    const score = Math.max(0, 1 - d * 1.6);
    return { variant: t.variant, score };
  }).sort((a, b) => b.score - a.score);
}

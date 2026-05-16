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
  // No indicative-angle rotation. Most users draw shapes upright, and the
  // rotation step actively hurt asymmetric shapes (heart, droplet, moon)
  // because the candidate and the template ended up at different
  // orientations depending on which point they started from.
  //
  // Centre on the *centroid* first, then scale uniformly. The previous
  // order ("scale bbox into [-0.5, 0.5] then translate centroid") moved
  // asymmetric shapes around relative to symmetric ones — a heart's
  // centroid sits above its bbox centre so it ended up offset from the
  // template's heart after normalisation. Doing it this way means the
  // user's heart and the template heart end up in the same place.
  const resampled = resample(points, N_POINTS);
  const c = centroid(resampled);
  const centered = resampled.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  // Uniform scale: longest centroid-relative extent becomes 0.5.
  let maxAbs = 0;
  for (const p of centered) {
    const m = Math.max(Math.abs(p.x), Math.abs(p.y));
    if (m > maxAbs) maxAbs = m;
  }
  if (maxAbs < 1e-6) return centered;
  const s = 0.5 / maxAbs;
  return centered.map((p) => ({ x: p.x * s, y: p.y * s }));
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

function genMoon(): Point[] {
  // Outer arc (left semicircle of a unit-radius circle): top → left → bottom
  // Inner arc (right side of a narrower ellipse): bottom → middle → top
  const out: Point[] = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    out.push({ x: -Math.cos(a), y: Math.sin(a) });
  }
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + (i / N) * Math.PI;
    out.push({ x: -0.4 * Math.cos(a), y: Math.sin(a) });
  }
  return out;
}

function genDroplet(): Point[] {
  // Parametric teardrop, point at top.
  return Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2;
    const x = (1 - Math.cos(t)) * Math.sin(t) * 0.7;
    const y = -Math.cos(t);
    return { x, y };
  });
}

function genLightning(): Point[] {
  // Lightning-bolt corners (closed polygon).
  const corners: Point[] = [
    { x: 0.05, y: -1 },
    { x: -0.4, y: -0.1 },
    { x: -0.05, y: -0.1 },
    { x: -0.25, y: 1 },
    { x: 0.35, y: -0.05 },
    { x: 0, y: -0.05 },
    { x: 0.35, y: -1 },
  ];
  const out: Point[] = [];
  const N_PER_SEG = 14;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < N_PER_SEG; j++) out.push(lerp(a, b, j / N_PER_SEG));
  }
  return out;
}

function genLeaf(): Point[] {
  // Lens-shaped leaf, narrow at top and bottom.
  const N = 96;
  return Array.from({ length: N }, (_, i) => {
    const t = (i / N) * Math.PI * 2;
    const x = 0.4 * Math.sin(t);
    const y = Math.cos(t);
    return { x, y };
  });
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
  { variant: "moon", points: genMoon() },
  { variant: "droplet", points: genDroplet() },
  { variant: "lightning", points: genLightning() },
  { variant: "leaf", points: genLeaf() },
];

const TEMPLATES: Template[] = RAW_TEMPLATES.map((t) => ({
  variant: t.variant,
  points: preprocess(t.points),
}));

// ---- matching ----

/**
 * One-sided Chamfer distance: for each point in `a`, find the nearest
 * point in `b` and average those distances. Unlike point-by-point
 * comparison this is independent of drawing direction and starting
 * point — a circle drawn clockwise scores the same as one drawn
 * counter-clockwise, which the user expects.
 */
function chamferOneWay(a: Point[], b: Point[]): number {
  let total = 0;
  for (const p of a) {
    let min = Infinity;
    for (const q of b) {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < min) min = d2;
    }
    total += Math.sqrt(min);
  }
  return total / a.length;
}

function symmetricChamfer(a: Point[], b: Point[]): number {
  return (chamferOneWay(a, b) + chamferOneWay(b, a)) / 2;
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
  return TEMPLATES.map((t) => {
    const d = symmetricChamfer(processed, t.points);
    // Chamfer distances on unit-bbox shapes typically run 0.02 (great)
    // to ~0.25 (poor). Scale into a 0..1 score; cap at 0.
    const score = Math.max(0, 1 - d * 4);
    return { variant: t.variant, score };
  }).sort((a, b) => b.score - a.score);
}

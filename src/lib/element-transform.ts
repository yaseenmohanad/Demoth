import type { DesignElement } from "./types";

export interface StrokeBBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Compute the geometric bbox of an SVG path's d attribute by scraping the
 * numeric pairs out of it. Returns null if the path has no points. */
export function strokeBBox(d: string): StrokeBBox | null {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = parseFloat(numbers[i]);
    const y = parseFloat(numbers[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/** Build the SVG `transform` attribute that maps the element from its
 * canonical (creation-time) coordinates onto its current position, size,
 * rotation, and flip state. Empty string when no transform is needed. */
export function elementTransform(el: DesignElement): string {
  const flipX = el.flipX ? -1 : 1;
  const flipY = el.flipY ? -1 : 1;

  if (el.type === "stroke") {
    // The stroke's d is in its original drawing coords. The natural bbox
    // (cx0, cy0, w0, h0) is recovered from d. The current x/y/w/h/rot
    // describe how that bbox should be mapped onto the canvas.
    const bbox = strokeBBox(el.d);
    if (!bbox) return "";
    const { cx: cx0, cy: cy0, w: w0, h: h0 } = bbox;
    const tx = el.x;
    const ty = el.y;
    const tw = el.w;
    const th = el.h;
    const rot = el.rot ?? 0;
    // For axis-aligned or single-point strokes (w0 or h0 ~= 0), skip
    // scaling on that axis instead of dividing by ~0 and exploding the
    // path / stroke width into the millions.
    const sx = w0 > 0.5 ? (tw / w0) * flipX : flipX;
    const sy = h0 > 0.5 ? (th / h0) * flipY : flipY;
    return `rotate(${rot} ${tx} ${ty}) translate(${tx} ${ty}) scale(${sx} ${sy}) translate(${-cx0} ${-cy0})`;
  }

  // text / image / shape — pivot at (x, y), with rotation outermost
  const cx = el.x;
  const cy = el.y;
  const rot = el.rot ?? 0;
  const hasFlip = flipX !== 1 || flipY !== 1;
  if (!hasFlip && !rot) return "";
  const rotatePart = rot ? `rotate(${rot} ${cx} ${cy}) ` : "";
  const flipPart = hasFlip
    ? `translate(${cx} ${cy}) scale(${flipX} ${flipY}) translate(${-cx} ${-cy})`
    : "";
  return (rotatePart + flipPart).trim();
}

import type { ShapeVariant } from "@/lib/types";

export const SHAPES_2D: ShapeVariant[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "star",
  "heart",
  "moon",
  "droplet",
  "lightning",
  "leaf",
  "arrow",
  "cross",
];

export const SHAPES_3D: ShapeVariant[] = [
  "cube3d",
  "sphere3d",
  "cylinder3d",
  "cone3d",
  "pyramid3d",
];

export const SHAPE_LABELS: Record<ShapeVariant, string> = {
  circle: "Circle",
  square: "Square",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  star: "Star",
  heart: "Heart",
  arrow: "Arrow",
  cross: "Cross",
  moon: "Moon",
  droplet: "Drop",
  lightning: "Bolt",
  leaf: "Leaf",
  cube3d: "3D Cube",
  sphere3d: "3D Sphere",
  cylinder3d: "3D Cylinder",
  cone3d: "3D Cone",
  pyramid3d: "3D Pyramid",
};

export function isShape3D(v: ShapeVariant): boolean {
  return v.endsWith("3d");
}

interface ShapeProps {
  variant: ShapeVariant;
  /** Center x in viewBox units. */
  cx: number;
  /** Center y in viewBox units. */
  cy: number;
  /** Width in viewBox units. */
  w: number;
  /** Height in viewBox units. */
  h: number;
  color: string;
  /** Stable id used for gradient defs (avoids SVG id collisions). */
  uid: string;
}

/**
 * Renders the SVG markup for a shape. The shape is drawn into a 1×1
 * coordinate space and scaled into the requested bounding box via SVG
 * transforms. Centering is at (cx, cy) and dimensions are (w, h).
 */
export function ShapeNode({ variant, cx, cy, w, h, color, uid }: ShapeProps) {
  const x = cx - w / 2;
  const y = cy - h / 2;

  // ---- 2D shapes (single fill) ----
  if (variant === "circle") {
    return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={color} />;
  }
  if (variant === "square") {
    return <rect x={x} y={y} width={w} height={h} fill={color} />;
  }
  if (variant === "triangle") {
    const points = `${cx},${y} ${x + w},${y + h} ${x},${y + h}`;
    return <polygon points={points} fill={color} />;
  }
  if (variant === "diamond") {
    const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    return <polygon points={points} fill={color} />;
  }
  if (variant === "pentagon") {
    const points = polygonPoints(5, cx, cy, w / 2, h / 2, -Math.PI / 2);
    return <polygon points={points} fill={color} />;
  }
  if (variant === "hexagon") {
    const points = polygonPoints(6, cx, cy, w / 2, h / 2, 0);
    return <polygon points={points} fill={color} />;
  }
  if (variant === "star") {
    const points = starPoints(5, cx, cy, w / 2, (w / 2) * 0.4, h / 2, (h / 2) * 0.4);
    return <polygon points={points} fill={color} />;
  }
  if (variant === "heart") {
    // Cubic Bézier heart in a 0..1 space, scaled to bbox
    const path = heartPath(cx, cy, w, h);
    return <path d={path} fill={color} />;
  }
  if (variant === "arrow") {
    const path = arrowPath(cx, cy, w, h);
    return <path d={path} fill={color} />;
  }
  if (variant === "cross") {
    const path = crossPath(cx, cy, w, h);
    return <path d={path} fill={color} />;
  }
  if (variant === "moon") {
    return <path d={moonPath(cx, cy, w, h)} fill={color} />;
  }
  if (variant === "droplet") {
    return <path d={dropletPath(cx, cy, w, h)} fill={color} />;
  }
  if (variant === "lightning") {
    return <path d={lightningPath(cx, cy, w, h)} fill={color} />;
  }
  if (variant === "leaf") {
    return <path d={leafPath(cx, cy, w, h)} fill={color} />;
  }

  // ---- 3D shapes (use gradients for shading) ----
  const lightId = `${uid}-light`;
  const darkId = `${uid}-dark`;

  if (variant === "sphere3d") {
    return (
      <g>
        <defs>
          <radialGradient id={lightId} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="white" stopOpacity="0.85" />
            <stop offset="40%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </radialGradient>
          <radialGradient id={darkId} cx="65%" cy="80%" r="60%">
            <stop offset="0%" stopColor="black" stopOpacity="0.55" />
            <stop offset="100%" stopColor="black" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          fill={`url(#${lightId})`}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          fill={`url(#${darkId})`}
        />
      </g>
    );
  }

  if (variant === "cube3d") {
    // Isometric cube — front, top, side faces
    const d = Math.min(w, h) * 0.25; // depth
    const front: [number, number][] = [
      [x, y + d],
      [x + w - d, y + d],
      [x + w - d, y + h],
      [x, y + h],
    ];
    const top: [number, number][] = [
      [x, y + d],
      [x + d, y],
      [x + w, y],
      [x + w - d, y + d],
    ];
    const side: [number, number][] = [
      [x + w - d, y + d],
      [x + w, y],
      [x + w, y + h - d],
      [x + w - d, y + h],
    ];
    return (
      <g>
        <polygon points={pts(front)} fill={color} />
        <polygon points={pts(top)} fill={lighten(color, 0.3)} />
        <polygon points={pts(side)} fill={darken(color, 0.25)} />
      </g>
    );
  }

  if (variant === "cylinder3d") {
    const ellipseRy = h * 0.12;
    return (
      <g>
        <defs>
          <linearGradient id={lightId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={darken(color, 0.25)} />
            <stop offset="50%" stopColor={lighten(color, 0.15)} />
            <stop offset="100%" stopColor={darken(color, 0.25)} />
          </linearGradient>
        </defs>
        {/* body */}
        <rect
          x={x}
          y={y + ellipseRy}
          width={w}
          height={h - ellipseRy * 2}
          fill={`url(#${lightId})`}
        />
        {/* bottom ellipse */}
        <ellipse
          cx={cx}
          cy={y + h - ellipseRy}
          rx={w / 2}
          ry={ellipseRy}
          fill={darken(color, 0.25)}
        />
        {/* top ellipse */}
        <ellipse
          cx={cx}
          cy={y + ellipseRy}
          rx={w / 2}
          ry={ellipseRy}
          fill={lighten(color, 0.2)}
          stroke={darken(color, 0.2)}
          strokeWidth={1}
        />
      </g>
    );
  }

  if (variant === "cone3d") {
    return (
      <g>
        <defs>
          <linearGradient id={lightId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={darken(color, 0.3)} />
            <stop offset="50%" stopColor={lighten(color, 0.2)} />
            <stop offset="100%" stopColor={darken(color, 0.3)} />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx} ${y} L ${x + w} ${y + h * 0.95} L ${x} ${y + h * 0.95} Z`}
          fill={`url(#${lightId})`}
        />
        <ellipse
          cx={cx}
          cy={y + h * 0.95}
          rx={w / 2}
          ry={h * 0.08}
          fill={darken(color, 0.3)}
        />
      </g>
    );
  }

  if (variant === "pyramid3d") {
    // Front, right, top triangles for a 3D-ish look
    const apex: [number, number] = [cx, y];
    const bl: [number, number] = [x, y + h];
    const br: [number, number] = [x + w, y + h];
    const front: [number, number][] = [apex, bl, br];
    const side: [number, number][] = [
      apex,
      br,
      [x + w * 0.7, y + h * 0.85],
    ];
    return (
      <g>
        <polygon points={pts(front)} fill={color} />
        <polygon points={pts(side)} fill={darken(color, 0.3)} />
      </g>
    );
  }

  return null;
}

// ---- helpers ----

function pts(points: [number, number][]): string {
  return points.map(([px, py]) => `${px},${py}`).join(" ");
}

function polygonPoints(
  sides: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle: number
): string {
  const out: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides;
    out.push(`${cx + Math.cos(a) * rx},${cy + Math.sin(a) * ry}`);
  }
  return out.join(" ");
}

function starPoints(
  spikes: number,
  cx: number,
  cy: number,
  rxOuter: number,
  rxInner: number,
  ryOuter: number,
  ryInner: number
): string {
  const out: string[] = [];
  const step = Math.PI / spikes;
  let a = -Math.PI / 2;
  for (let i = 0; i < spikes * 2; i++) {
    const rx = i % 2 === 0 ? rxOuter : rxInner;
    const ry = i % 2 === 0 ? ryOuter : ryInner;
    out.push(`${cx + Math.cos(a) * rx},${cy + Math.sin(a) * ry}`);
    a += step;
  }
  return out.join(" ");
}

function heartPath(cx: number, cy: number, w: number, h: number): string {
  // Compose a heart from two arcs and a V
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    `M ${cx} ${y + h * 0.85}`,
    `C ${x} ${y + h * 0.6}, ${x} ${y + h * 0.05}, ${cx} ${y + h * 0.3}`,
    `C ${x + w} ${y + h * 0.05}, ${x + w} ${y + h * 0.6}, ${cx} ${y + h * 0.85}`,
    `Z`,
  ].join(" ");
}

function arrowPath(cx: number, cy: number, w: number, h: number): string {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const shaftH = h * 0.4;
  const headW = w * 0.4;
  return [
    `M ${x} ${y + (h - shaftH) / 2}`,
    `L ${x + w - headW} ${y + (h - shaftH) / 2}`,
    `L ${x + w - headW} ${y}`,
    `L ${x + w} ${cy}`,
    `L ${x + w - headW} ${y + h}`,
    `L ${x + w - headW} ${y + (h + shaftH) / 2}`,
    `L ${x} ${y + (h + shaftH) / 2}`,
    `Z`,
  ].join(" ");
}

function crossPath(cx: number, cy: number, w: number, h: number): string {
  const armW = w * 0.3;
  const armH = h * 0.3;
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    `M ${x + (w - armW) / 2} ${y}`,
    `L ${x + (w + armW) / 2} ${y}`,
    `L ${x + (w + armW) / 2} ${y + (h - armH) / 2}`,
    `L ${x + w} ${y + (h - armH) / 2}`,
    `L ${x + w} ${y + (h + armH) / 2}`,
    `L ${x + (w + armW) / 2} ${y + (h + armH) / 2}`,
    `L ${x + (w + armW) / 2} ${y + h}`,
    `L ${x + (w - armW) / 2} ${y + h}`,
    `L ${x + (w - armW) / 2} ${y + (h + armH) / 2}`,
    `L ${x} ${y + (h + armH) / 2}`,
    `L ${x} ${y + (h - armH) / 2}`,
    `L ${x + (w - armW) / 2} ${y + (h - armH) / 2}`,
    `Z`,
  ].join(" ");
}

function moonPath(cx: number, cy: number, w: number, h: number): string {
  // A waning crescent: a big outer arc on the left, a smaller inner arc
  // on the right that bites the moon's middle out.
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * 0.5;
  return [
    `M ${cx} ${cy - ry}`,
    // outer arc — top → left → bottom
    `A ${rx} ${ry} 0 0 0 ${cx} ${cy + ry}`,
    // inner arc — bottom → into the body → top
    `A ${innerRx} ${ry} 0 0 1 ${cx} ${cy - ry}`,
    `Z`,
  ].join(" ");
}

function dropletPath(cx: number, cy: number, w: number, h: number): string {
  // Teardrop with the point at the top, round bottom.
  const rx = w / 2;
  const ry = h / 2;
  const topY = cy - ry;
  const botY = cy + ry;
  return [
    `M ${cx} ${topY}`,
    // Right side: cubic from top point to bottom-right curve
    `C ${cx + rx} ${cy - ry * 0.3} ${cx + rx} ${cy + ry * 0.5} ${cx} ${botY}`,
    // Left side back to top
    `C ${cx - rx} ${cy + ry * 0.5} ${cx - rx} ${cy - ry * 0.3} ${cx} ${topY}`,
    `Z`,
  ].join(" ");
}

function lightningPath(cx: number, cy: number, w: number, h: number): string {
  // Classic seven-point zigzag bolt.
  const x = cx - w / 2;
  const y = cy - h / 2;
  return [
    `M ${x + w * 0.55} ${y}`,
    `L ${x + w * 0.1}  ${y + h * 0.45}`,
    `L ${x + w * 0.45} ${y + h * 0.45}`,
    `L ${x + w * 0.25} ${y + h}`,
    `L ${x + w * 0.85} ${y + h * 0.45}`,
    `L ${x + w * 0.5}  ${y + h * 0.45}`,
    `L ${x + w * 0.85} ${y}`,
    `Z`,
  ].join(" ");
}

function leafPath(cx: number, cy: number, w: number, h: number): string {
  // Lens-shaped leaf, pointed at top and bottom, fat in the middle.
  // Two cubic curves that meet at a slight angle.
  const rx = w / 2;
  const ry = h / 2;
  return [
    `M ${cx} ${cy - ry}`,
    `C ${cx + rx} ${cy - ry * 0.4} ${cx + rx} ${cy + ry * 0.4} ${cx} ${cy + ry}`,
    `C ${cx - rx} ${cy + ry * 0.4} ${cx - rx} ${cy - ry * 0.4} ${cx} ${cy - ry}`,
    `Z`,
  ].join(" ");
}

/** Lighten a hex color by mixing with white. amount in [0,1]. */
function lighten(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}
function darken(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}
function mix(a: string, b: string, t: number): string {
  const ac = parse(a);
  const bc = parse(b);
  if (!ac || !bc) return a;
  const r = Math.round(ac.r * (1 - t) + bc.r * t);
  const g = Math.round(ac.g * (1 - t) + bc.g * t);
  const bl = Math.round(ac.b * (1 - t) + bc.b * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function parse(hex: string): { r: number; g: number; b: number } | null {
  let s = hex.replace("#", "");
  if (s.length === 3) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

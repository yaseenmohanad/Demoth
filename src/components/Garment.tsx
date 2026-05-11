import type { GarmentType } from "@/lib/types";

/** Returns SVG path data for the body of a garment, sized to a 400x500 viewBox. */
export function garmentPath(type: GarmentType): string {
  if (type === "tshirt") {
    // T-shirt silhouette: short sleeves, round neck
    return [
      "M 140 60",
      "L 90 90",
      "L 50 140",
      "L 90 175",
      "L 110 155",
      "L 110 460",
      "L 290 460",
      "L 290 155",
      "L 310 175",
      "L 350 140",
      "L 310 90",
      "L 260 60",
      "C 245 95, 155 95, 140 60",
      "Z",
    ].join(" ");
  }
  // shirt: collared, longer sleeves, button placket
  return [
    "M 145 55",
    "L 80 95",
    "L 40 165",
    "L 85 200",
    "L 110 175",
    "L 110 465",
    "L 290 465",
    "L 290 175",
    "L 315 200",
    "L 360 165",
    "L 320 95",
    "L 255 55",
    "L 220 90",
    "L 200 110",
    "L 180 90",
    "Z",
  ].join(" ");
}

/** Extra decoration overlay (collar/buttons) drawn on top of body for shirts. */
export function GarmentDetails({ type }: { type: GarmentType }) {
  if (type === "tshirt") return null;
  return (
    <g pointerEvents="none">
      {/* button placket */}
      <line x1="200" y1="110" x2="200" y2="455" stroke="rgba(0,0,0,0.12)" strokeWidth="1.5" />
      {[140, 200, 260, 320, 380].map((y) => (
        <circle key={y} cx="200" cy={y} r="2.5" fill="rgba(0,0,0,0.25)" />
      ))}
      {/* collar lines */}
      <path
        d="M 180 90 L 200 130 L 220 90"
        fill="none"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1.5"
      />
    </g>
  );
}

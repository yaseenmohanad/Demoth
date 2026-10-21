import type { GarmentType, GarmentSide } from "@/lib/types";

/**
 * Returns SVG path data for a garment silhouette, sized to the shared
 * 400×500 viewBox the design canvas uses.
 *
 * `side` picks front or back; back versions are the same silhouette
 * but with different internal detail (no neckline on a shirt's back,
 * single back panel on jackets, etc.). The outer outline is kept
 * roughly symmetric so the design area the user has to work with
 * doesn't change size when they flip sides.
 */
export function garmentPath(
  type: GarmentType,
  side: GarmentSide = "front"
): string {
  switch (type) {
    case "tshirt":
      return side === "front" ? TSHIRT_FRONT : TSHIRT_BACK;
    case "shirt":
      return side === "front" ? SHIRT_FRONT : SHIRT_BACK;
    case "jacket":
      return side === "front" ? JACKET_FRONT : JACKET_BACK;
    case "pants":
      return side === "front" ? PANTS_FRONT : PANTS_BACK;
    case "pjs":
      return side === "front" ? PJS_FRONT : PJS_BACK;
    case "shorts":
      return side === "front" ? SHORTS_FRONT : SHORTS_BACK;
  }
}

/** Decoration overlay (buttons, zippers, pockets, waistbands) drawn
 *  on top of the base silhouette. Keeps the body shape path simple
 *  and renders stroke-only details on top so garment colors stay
 *  clean under them. */
export function GarmentDetails({
  type,
  side = "front",
}: {
  type: GarmentType;
  side?: GarmentSide;
}) {
  const common = {
    stroke: "rgba(0,0,0,0.22)",
    strokeWidth: 1.5,
    fill: "none",
  } as const;
  const faint = {
    stroke: "rgba(0,0,0,0.14)",
    strokeWidth: 1.3,
    fill: "none",
  } as const;

  switch (type) {
    case "tshirt":
      if (side === "back") {
        // Back of t-shirt — just a round neckline arc.
        return (
          <g pointerEvents="none">
            <path d="M 155 80 Q 200 65 245 80" {...common} />
          </g>
        );
      }
      return null;

    case "shirt":
      if (side === "back") {
        return (
          <g pointerEvents="none">
            {/* Yoke seam across the shoulders */}
            <path d="M 100 115 Q 200 140 300 115" {...faint} />
            {/* Collar line */}
            <path d="M 175 85 Q 200 100 225 85" {...common} />
          </g>
        );
      }
      return (
        <g pointerEvents="none">
          {/* Button placket */}
          <line
            x1="200"
            y1="110"
            x2="200"
            y2="455"
            stroke="rgba(0,0,0,0.12)"
            strokeWidth="1.5"
          />
          {[140, 200, 260, 320, 380].map((y) => (
            <circle key={y} cx="200" cy={y} r="2.5" fill="rgba(0,0,0,0.25)" />
          ))}
          {/* Collar lines */}
          <path d="M 180 90 L 200 130 L 220 90" {...common} />
        </g>
      );

    case "jacket":
      if (side === "back") {
        return (
          <g pointerEvents="none">
            {/* Yoke seam */}
            <path d="M 100 125 Q 200 150 300 125" {...faint} />
            {/* Center back seam */}
            <line
              x1="200"
              y1="150"
              x2="200"
              y2="460"
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="1.3"
            />
          </g>
        );
      }
      return (
        <g pointerEvents="none">
          {/* Lapels */}
          <path d="M 180 75 L 165 240 L 200 155" {...common} />
          <path d="M 220 75 L 235 240 L 200 155" {...common} />
          {/* Zipper center line */}
          <line
            x1="200"
            y1="155"
            x2="200"
            y2="460"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="1.6"
            strokeDasharray="3 2"
          />
          {/* Pockets */}
          <rect
            x="118"
            y="300"
            width="60"
            height="38"
            rx="4"
            {...faint}
          />
          <rect
            x="222"
            y="300"
            width="60"
            height="38"
            rx="4"
            {...faint}
          />
        </g>
      );

    case "pants":
      if (side === "back") {
        return (
          <g pointerEvents="none">
            {/* Waistband */}
            <line x1="130" y1="75" x2="270" y2="75" {...common} />
            <line x1="130" y1="88" x2="270" y2="88" {...faint} />
            {/* Back pockets */}
            <path d="M 150 115 L 180 115 L 180 150 L 150 150 Z" {...faint} />
            <path d="M 220 115 L 250 115 L 250 150 L 220 150 Z" {...faint} />
            {/* Inseam / center back */}
            <line
              x1="200"
              y1="90"
              x2="200"
              y2="230"
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="1.3"
            />
          </g>
        );
      }
      return (
        <g pointerEvents="none">
          {/* Waistband */}
          <line x1="130" y1="75" x2="270" y2="75" {...common} />
          <line x1="130" y1="88" x2="270" y2="88" {...faint} />
          {/* Button and fly */}
          <circle cx="200" cy="100" r="2.5" fill="rgba(0,0,0,0.3)" />
          <line
            x1="200"
            y1="105"
            x2="200"
            y2="160"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1.3"
          />
          {/* Front pockets */}
          <path d="M 135 95 Q 155 140 170 160" {...faint} />
          <path d="M 265 95 Q 245 140 230 160" {...faint} />
          {/* Center seam / inseam marker */}
          <line
            x1="200"
            y1="165"
            x2="200"
            y2="230"
            stroke="rgba(0,0,0,0.12)"
            strokeWidth="1.3"
          />
        </g>
      );

    case "pjs":
      if (side === "back") {
        return (
          <g pointerEvents="none">
            {/* Back neckline */}
            <path d="M 160 80 Q 200 70 240 80" {...common} />
            {/* Horizontal top-bottom split */}
            <line x1="110" y1="265" x2="290" y2="265" {...faint} />
          </g>
        );
      }
      return (
        <g pointerEvents="none">
          {/* V-neck */}
          <path d="M 170 80 L 200 130 L 230 80" {...common} />
          {/* Horizontal top-bottom split (top meets pants) */}
          <line x1="110" y1="265" x2="290" y2="265" {...faint} />
          {/* Drawstring on pants waist */}
          <line
            x1="155"
            y1="280"
            x2="195"
            y2="280"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="1.5"
          />
          <line
            x1="205"
            y1="280"
            x2="245"
            y2="280"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="1.5"
          />
          <path d="M 195 280 Q 200 290 205 280" {...common} />
        </g>
      );

    case "shorts":
      if (side === "back") {
        return (
          <g pointerEvents="none">
            {/* Waistband */}
            <line x1="130" y1="75" x2="270" y2="75" {...common} />
            <line x1="130" y1="88" x2="270" y2="88" {...faint} />
            {/* Back pockets */}
            <path d="M 150 115 L 180 115 L 180 150 L 150 150 Z" {...faint} />
            <path d="M 220 115 L 250 115 L 250 150 L 220 150 Z" {...faint} />
          </g>
        );
      }
      return (
        <g pointerEvents="none">
          {/* Waistband */}
          <line x1="130" y1="75" x2="270" y2="75" {...common} />
          <line x1="130" y1="88" x2="270" y2="88" {...faint} />
          {/* Button + fly */}
          <circle cx="200" cy="100" r="2.5" fill="rgba(0,0,0,0.3)" />
          <line
            x1="200"
            y1="105"
            x2="200"
            y2="160"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1.3"
          />
          {/* Front pockets */}
          <path d="M 135 95 Q 155 130 170 150" {...faint} />
          <path d="M 265 95 Q 245 130 230 150" {...faint} />
          {/* Hem line */}
          <line x1="130" y1="260" x2="200" y2="260" {...faint} />
          <line x1="200" y1="260" x2="270" y2="260" {...faint} />
        </g>
      );
  }
}

// ---- Shared silhouettes --------------------------------------------------

const TSHIRT_FRONT = [
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

// Back of a t-shirt: same outer silhouette, but the neckline is a
// gentle inward arc instead of the deeper rounded dip on the front.
const TSHIRT_BACK = [
  "M 155 65",
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
  "L 245 65",
  "Q 200 85, 155 65",
  "Z",
].join(" ");

const SHIRT_FRONT = [
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

// Back of shirt — no collar notch (collar sits on front only), neckline
// is a gentle arc.
const SHIRT_BACK = [
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
  "Q 200 80, 145 55",
  "Z",
].join(" ");

// Jacket: slightly bulkier than a shirt (bigger sleeves + body) to
// read as outerwear.
const JACKET_FRONT = [
  "M 140 55",
  "L 65 90",
  "L 25 180",
  "L 80 215",
  "L 110 185",
  "L 110 470",
  "L 290 470",
  "L 290 185",
  "L 320 215",
  "L 375 180",
  "L 335 90",
  "L 260 55",
  "L 220 85",
  "L 200 110",
  "L 180 85",
  "Z",
].join(" ");

const JACKET_BACK = [
  "M 150 55",
  "L 65 90",
  "L 25 180",
  "L 80 215",
  "L 110 185",
  "L 110 470",
  "L 290 470",
  "L 290 185",
  "L 320 215",
  "L 375 180",
  "L 335 90",
  "L 250 55",
  "Q 200 80, 150 55",
  "Z",
].join(" ");

// Pants: full-length, two legs separated by a central crotch notch.
const PANTS_FRONT = [
  "M 130 65",
  "L 270 65",
  "L 275 220",
  "L 240 465",
  "L 190 465",
  "L 200 240",
  "L 210 465",
  "L 160 465",
  "L 125 220",
  "Z",
].join(" ");

const PANTS_BACK = PANTS_FRONT;

// Pyjamas = long-sleeve top + full pants, drawn as a single silhouette
// that fills most of the frame.
const PJS_FRONT = [
  "M 145 55",
  "L 85 85",
  "L 50 150",
  "L 95 185",
  "L 115 160",
  "L 115 265",
  "L 130 265",
  "L 135 465",
  "L 190 465",
  "L 200 275",
  "L 210 465",
  "L 265 465",
  "L 270 265",
  "L 285 265",
  "L 285 160",
  "L 305 185",
  "L 350 150",
  "L 315 85",
  "L 255 55",
  "L 220 90",
  "L 200 110",
  "L 180 90",
  "Z",
].join(" ");

const PJS_BACK = [
  "M 145 55",
  "L 85 85",
  "L 50 150",
  "L 95 185",
  "L 115 160",
  "L 115 265",
  "L 130 265",
  "L 135 465",
  "L 190 465",
  "L 200 275",
  "L 210 465",
  "L 265 465",
  "L 270 265",
  "L 285 265",
  "L 285 160",
  "L 305 185",
  "L 350 150",
  "L 315 85",
  "L 255 55",
  "Q 200 80, 145 55",
  "Z",
].join(" ");

// Shorts: like the top half of pants.
const SHORTS_FRONT = [
  "M 130 65",
  "L 270 65",
  "L 275 180",
  "L 250 275",
  "L 200 275",
  "L 200 210",
  "L 150 275",
  "L 125 180",
  "Z",
].join(" ");

const SHORTS_BACK = SHORTS_FRONT;

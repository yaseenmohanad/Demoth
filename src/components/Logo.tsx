"use client";

import { useId } from "react";

interface Props {
  /** Visual size in pixels (used for both width and height). */
  size?: number;
  /** No-op — kept only to avoid breaking older call sites that pass
   *  `<Logo spinning={false} />`. The logo doesn't animate. */
  spinning?: boolean;
  className?: string;
}

/**
 * Demoth's brand mark — a stylized moth silhouette playing on the
 * name literally containing "moth" (fitting for an app about
 * garment design; moths + textiles are a natural pairing). The mark
 * is a single inline SVG so it scales crisply at any size from a
 * 16px favicon up to a hero-sized banner without any raster
 * artifacts, and no network request is needed for it to render.
 *
 * Composition (viewBox 100x100, mostly symmetric across x=50):
 *   - Two wings drawn as bezier curves radiating from the body,
 *     with a lighter forewing pair on top and slightly darker
 *     hindwings behind — like real moth wings
 *   - Central "body" that doubles as a stylized needle: a thin
 *     vertical spindle tapered to a point at the bottom (the
 *     needle tip) and with a small "eye" hole at the top (the
 *     needle eye)
 *   - Two thin curved antennae extending up from the head
 *   - Small round wing-spot on each forewing — the classic moth
 *     eyespot marking, doubling as an "M" dot subtly
 *   - Purple gradients throughout matching the app's palette
 */
export default function Logo({ size = 32, className = "" }: Props) {
  // Unique gradient ids so multiple logos on the same page (header +
  // upsell modal, for example) don't collide.
  const uid = useId().replace(/:/g, "");
  const gForewing = `${uid}-fw`;
  const gHindwing = `${uid}-hw`;
  const gBody = `${uid}-body`;

  return (
    <span
      role="img"
      aria-label="Demoth"
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* Forewing (top pair): brighter, catches the light. */}
          <linearGradient id={gForewing} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="60%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          {/* Hindwing (bottom pair): a shade darker so the forewing
              reads as sitting on top of it. */}
          <linearGradient id={gHindwing} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
          {/* Body/needle: deep violet with a highlight ridge. */}
          <linearGradient id={gBody} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4c1d95" />
            <stop offset="50%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
        </defs>

        {/* Antennae — a pair of thin curls extending up from the head. */}
        <path
          d="M 46,20 C 42,10 34,8 30,14"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 54,20 C 58,10 66,8 70,14"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Small dots at the antennae tips for that little "beaded"
            look real moths have. */}
        <circle cx="30" cy="14" r="1.8" fill="#7c3aed" />
        <circle cx="70" cy="14" r="1.8" fill="#7c3aed" />

        {/* Hindwings (drawn first so forewings overlap them). Two
            large teardrop shapes trailing down and outward. */}
        <path
          d="M 50,55 C 30,55 12,65 18,82 C 24,92 42,85 50,72 Z"
          fill={`url(#${gHindwing})`}
        />
        <path
          d="M 50,55 C 70,55 88,65 82,82 C 76,92 58,85 50,72 Z"
          fill={`url(#${gHindwing})`}
        />

        {/* Forewings — the top pair that gives moths their distinctive
            silhouette. Wider and higher than the hindwings. */}
        <path
          d="M 50,28 C 30,20 8,28 8,50 C 8,62 22,66 42,60 C 48,58 50,50 50,42 Z"
          fill={`url(#${gForewing})`}
        />
        <path
          d="M 50,28 C 70,20 92,28 92,50 C 92,62 78,66 58,60 C 52,58 50,50 50,42 Z"
          fill={`url(#${gForewing})`}
        />

        {/* Wing-spots — small circular eyespots on each forewing.
            Also happen to look like tiny buttons, tying back to
            the "garment design" theme. */}
        <circle cx="26" cy="46" r="4" fill="#fef3c7" opacity="0.9" />
        <circle cx="26" cy="46" r="2" fill="#f59e0b" />
        <circle cx="74" cy="46" r="4" fill="#fef3c7" opacity="0.9" />
        <circle cx="74" cy="46" r="2" fill="#f59e0b" />

        {/* Body — vertical spindle doubling as a stitching needle.
            Round head at the top (with a tiny "eye" hole), tapered
            point at the bottom (the needle tip). */}
        {/* Body outline */}
        <path
          d="M 47,22
             Q 47,18 50,18
             Q 53,18 53,22
             L 53,72
             L 50,80
             L 47,72
             Z"
          fill={`url(#${gBody})`}
        />
        {/* Highlight ridge running down the center of the body */}
        <path
          d="M 50,24 L 50,68"
          fill="none"
          stroke="#c4b5fd"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.6"
        />
        {/* Needle eye — small oblong opening at the top of the body */}
        <ellipse cx="50" cy="24" rx="1.2" ry="2" fill="#1e1b4b" />

        {/* Subtle thread trailing off the needle tip — the final
            garment-design cue. */}
        <path
          d="M 50,80 Q 55,86 52,92 Q 49,96 44,94"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </span>
  );
}

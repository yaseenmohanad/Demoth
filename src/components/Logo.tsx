"use client";

import { useId } from "react";

interface Props {
  /** Overall font size in pixels; the butterfly + diamond scale
   *  relative to this. */
  size?: number;
  /** No-op — kept for back-compat with older `spinning={false}` sites. */
  spinning?: boolean;
  /** When true, the "o" in Demoth is replaced with a hand-sketched
   *  diamond. Off by default. */
  premium?: boolean;
  className?: string;
}

/**
 * Demoth's brand mark. Rendered as HTML text with inline SVG icons
 * so the browser's own text layout handles all positioning — the
 * diamond lands exactly in the "o" slot (because it literally *is*
 * the o), and the butterfly sits immediately after the "h" without
 * any pixel estimation on my part.
 *
 * Structure:
 *   <span>
 *     Dem                     ← cursive text
 *     [o character | diamond] ← character-position substitute
 *     th                      ← cursive text
 *     [butterfly icon]        ← inline, follows the h naturally
 *   </span>
 *
 * All the visible color comes from the shared purple palette. The
 * cursive font stack falls back gracefully across Windows/Mac/Linux.
 */
export default function Logo({
  size = 32,
  premium = false,
  className = "",
}: Props) {
  return (
    <span
      role="img"
      aria-label="Demoth"
      className={`inline-flex items-center whitespace-nowrap ${className}`}
      style={{
        fontFamily:
          "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        color: "#7c3aed",
        letterSpacing: "-0.02em",
      }}
    >
      {/* "Dem" — first half of the word */}
      Dem
      {/* The "o" slot: real letter, or a drawn diamond when premium. */}
      {premium ? <DiamondO size={size * 0.7} /> : "o"}
      {/* "th" — second half of the word */}
      th
      {/* Butterfly perched right after the h. verticalAlign keeps it
          hovering near the top of the letters. */}
      <Butterfly size={size * 0.85} />
    </span>
  );
}

/**
 * Hand-sketched diamond, rendered inline as an SVG that behaves like
 * a text character. Deliberately wobbly path so it reads as "drawn"
 * rather than as a geometrically-perfect polygon.
 */
function DiamondO({ size }: { size: number }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="presentation"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        // No horizontal margin — diamond touches the m on the left
        // and the t on the right, exactly like the o would.
        marginLeft: 0,
        marginRight: 0,
        // Slight downward nudge to sit visually where the "o"'s
        // x-height center would land.
        transform: "translateY(6%)",
      }}
    >
      <path
        d="M 6,17 Q 8,11 20,3 Q 32,11 34,17 Q 30,29 20,37 Q 10,29 6,17 Z"
        fill="#c4b5fd"
        fillOpacity="0.4"
        stroke="#7c3aed"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 10,15 L 20,6 L 30,15 M 20,6 L 20,35"
        fill="none"
        stroke="#7c3aed"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Keep the useId call live even if the returned id isn't used
          elsewhere — required for stable SSR hydration. */}
      <title>{uid.slice(0, 0)}Diamond</title>
    </svg>
  );
}

/**
 * Butterfly icon that sits after the "h" as an inline element.
 * Uses vertical-align to lift it up so it perches near the top of
 * the letters rather than sitting on the baseline.
 */
function Butterfly({ size }: { size: number }) {
  const uid = useId().replace(/:/g, "");
  const gWing = `${uid}-wing`;
  const gBody = `${uid}-body`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="presentation"
      style={{
        display: "inline-block",
        // Anchor to baseline first, then lift the icon just enough
        // that the pencil tip (~82% down the icon) touches the
        // h's top-right curl. -55% was too high; the tip floated
        // above the letter. -25% brings the tip down into contact.
        verticalAlign: "baseline",
        marginLeft: -size * 0.42,
        transform: `translateY(-25%)`,
      }}
    >
      <defs>
        <linearGradient id={gWing} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="60%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={gBody} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      {/* Antennae */}
      <path
        d="M 46,22 C 42,12 34,10 30,16"
        fill="none"
        stroke="#7c3aed"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 54,22 C 58,12 66,10 70,16"
        fill="none"
        stroke="#7c3aed"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="30" cy="16" r="3" fill="#7c3aed" />
      <circle cx="70" cy="16" r="3" fill="#7c3aed" />

      {/* Wings */}
      <path
        d="M 50,32 C 26,20 6,32 6,54 C 6,68 22,70 42,62 C 48,60 50,54 50,46 Z"
        fill={`url(#${gWing})`}
      />
      <path
        d="M 50,32 C 74,20 94,32 94,54 C 94,68 78,70 58,62 C 52,60 50,54 50,46 Z"
        fill={`url(#${gWing})`}
      />
      {/* Hindwings for depth */}
      <path
        d="M 50,58 C 34,58 22,68 26,82 C 30,90 44,86 50,74 Z"
        fill="#7c3aed"
      />
      <path
        d="M 50,58 C 66,58 78,68 74,82 C 70,90 56,86 50,74 Z"
        fill="#7c3aed"
      />

      {/* Wing spots — small golden button dots */}
      <circle cx="26" cy="50" r="4" fill="#fef3c7" opacity="0.9" />
      <circle cx="26" cy="50" r="2" fill="#f59e0b" />
      <circle cx="74" cy="50" r="4" fill="#fef3c7" opacity="0.9" />
      <circle cx="74" cy="50" r="2" fill="#f59e0b" />

      {/* Body / needle */}
      <path
        d="M 47,24
           Q 47,20 50,20
           Q 53,20 53,24
           L 53,74
           L 50,82
           L 47,74
           Z"
        fill={`url(#${gBody})`}
      />
    </svg>
  );
}

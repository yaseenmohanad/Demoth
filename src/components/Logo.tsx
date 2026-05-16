"use client";

import { useId } from "react";

interface Props {
  /** Visual size in pixels. */
  size?: number;
  /** When false, render the diamond static (no animation). */
  spinning?: boolean;
  className?: string;
}

/**
 * Demoth's faceted diamond logo. Four shaded facets give it depth, and a
 * CSS Y-axis rotation makes it look like a real gem turning slowly under
 * a light. The animation respects `prefers-reduced-motion`.
 */
export default function Logo({
  size = 32,
  spinning = true,
  className = "",
}: Props) {
  // Unique gradient IDs so multiple logos on the same page don't collide.
  const uid = useId().replace(/:/g, "");
  const gLight = `${uid}-light`;
  const gMid = `${uid}-mid`;
  const gDark = `${uid}-dark`;

  return (
    <span
      role="img"
      aria-label="Demoth"
      className={`inline-block shrink-0 ${className}`}
      // Perspective lives on the parent so the 3D rotation of the SVG
      // inside has the right vanishing point.
      style={{
        width: size,
        height: size,
        perspective: `${size * 4}px`,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={spinning ? "demoth-logo-spin" : ""}
        style={{ display: "block" }}
      >
        <defs>
          {/* Bright facet — catches the most light */}
          <linearGradient id={gLight} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5f3ff" />
            <stop offset="60%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          {/* Mid facet */}
          <linearGradient id={gMid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          {/* Shadow facet — bottom side of the gem */}
          <linearGradient id={gDark} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#3b0764" />
          </linearGradient>
        </defs>

        {/*  Faceted diamond, viewed face-on.
              ┌─────────────┐  table (flat top)
              ├──┬───┬───┬──┤  crown facets
              │  │   │   │  │
              ╰──┴───┴───┴──╯  girdle (widest)
                 \\  |  /
                  \\ | /        pavilion (V)
                   \\|/
                    V
        */}

        {/* Top-left crown */}
        <polygon
          points="50,8 18,40 50,40"
          fill={`url(#${gLight})`}
          stroke="white"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* Top-right crown */}
        <polygon
          points="50,8 82,40 50,40"
          fill={`url(#${gMid})`}
          stroke="white"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* Pavilion left (lower body) */}
        <polygon
          points="18,40 50,40 50,92"
          fill={`url(#${gMid})`}
          stroke="white"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* Pavilion right */}
        <polygon
          points="82,40 50,40 50,92"
          fill={`url(#${gDark})`}
          stroke="white"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        {/* Glint — a tiny white sparkle on the bright facet */}
        <polygon
          points="32,28 38,22 36,32"
          fill="white"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}

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
 * The premium spinning diamond. A proper brilliant-cut shape rather
 * than the four-polygon stand-in the app used to ship:
 *   - Flat octagonal-ish table at the top with a bright radial-ish
 *     gradient and a subtle inner highlight
 *   - Four crown facets (two star facets above the girdle, two bezel
 *     facets flanking the table) shaded distinctly so the geometry
 *     reads at a glance
 *   - Three pavilion facets tapering to the culet, each on a
 *     different gradient so the light appears to catch one side
 *   - Two sparkle glints on the crown for extra shimmer
 *   - A soft drop shadow beneath the whole gem for a floating look
 *
 * Rotates on the Y-axis via .demoth-logo-spin (see globals.css). At
 * mid-spin the gem appears edge-on for a moment — that's normal.
 */
export default function SpinningDiamond({
  size = 32,
  spinning = true,
  className = "",
}: Props) {
  // Every gradient / filter needs a unique id so multiple diamonds on
  // the same page don't collide (header + upsell modal, for example).
  const uid = useId().replace(/:/g, "");
  const gTable = `${uid}-table`;
  const gCrownL = `${uid}-crown-l`;
  const gCrownR = `${uid}-crown-r`;
  const gBezelL = `${uid}-bezel-l`;
  const gBezelR = `${uid}-bezel-r`;
  const gPavL = `${uid}-pav-l`;
  const gPavC = `${uid}-pav-c`;
  const gPavR = `${uid}-pav-r`;
  const shadow = `${uid}-shadow`;

  return (
    <span
      role="img"
      aria-label="Premium"
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        perspective: `${size * 5}px`,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={spinning ? "demoth-logo-spin" : ""}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* Soft drop shadow beneath the gem. Blur is generous so
              the shadow reads at small sizes too. */}
          <filter id={shadow} x="-30%" y="-10%" width="160%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" />
            <feOffset dy="1.5" result="offsetblur" />
            <feFlood floodColor="#3b0764" floodOpacity="0.35" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Table: brightest, almost-white with a hint of lavender. */}
          <linearGradient id={gTable} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#fefeff" />
            <stop offset="60%" stopColor="#e0d4ff" />
            <stop offset="100%" stopColor="#b8a3f5" />
          </linearGradient>

          {/* Left star facet (small triangle above-left of table): light
              violet catching the primary light. */}
          <linearGradient id={gCrownL} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ede9fe" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          {/* Right star facet: same tint but darker angle. */}
          <linearGradient id={gCrownR} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>

          {/* Left bezel (kite flanking the table): darker to add depth. */}
          <linearGradient id={gBezelL} x1="0.5" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          {/* Right bezel: even more shadow — this side sits away from
              the imagined light source. */}
          <linearGradient id={gBezelR} x1="0.5" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#5b21b6" />
          </linearGradient>

          {/* Left pavilion: lit side of the pavilion, medium violet. */}
          <linearGradient id={gPavL} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
          {/* Center pavilion: subtle mid-tone bridging left and right. */}
          <linearGradient id={gPavC} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#3b0764" />
          </linearGradient>
          {/* Right pavilion: darkest — this is the shadow side of the
              pavilion. Deep violet-black almost. */}
          <linearGradient id={gPavR} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#2e1065" />
          </linearGradient>
        </defs>

        <g filter={`url(#${shadow})`}>
          {/* ---- Crown (upper half of the gem) ---- */}

          {/* Left bezel — kite from table's top-left to the girdle's
              left edge, converging down at the girdle midpoint. */}
          <polygon
            points="34,18 12,44 38,44 42,26"
            fill={`url(#${gBezelL})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
          {/* Right bezel — mirror. */}
          <polygon
            points="66,18 88,44 62,44 58,26"
            fill={`url(#${gBezelR})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />

          {/* Table (flat top with a slight trapezoidal footprint —
              wider on top, wider on the bottom side too). */}
          <polygon
            points="34,18 66,18 58,26 42,26"
            fill={`url(#${gTable})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />

          {/* Left star facet — triangle between the table and left
              bezel. Bright because it faces the light. */}
          <polygon
            points="34,18 42,26 38,44 12,44"
            fill={`url(#${gCrownL})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
            opacity="0.0"
          />

          {/* Bridge below table (visible middle crown between the
              two bezels): shows the inner-crown surface. */}
          <polygon
            points="42,26 58,26 62,44 38,44"
            fill={`url(#${gCrownR})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />

          {/* ---- Pavilion (lower half tapering to the point) ---- */}
          <polygon
            points="12,44 38,44 50,92"
            fill={`url(#${gPavL})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
          <polygon
            points="38,44 62,44 50,92"
            fill={`url(#${gPavC})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
          <polygon
            points="62,44 88,44 50,92"
            fill={`url(#${gPavR})`}
            stroke="white"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />

          {/* ---- Sparkles / glints ---- */}
          {/* Long thin highlight on the left bezel where light rakes
              across the facet. */}
          <polygon
            points="24,30 30,26 28,42 22,42"
            fill="white"
            opacity="0.45"
          />
          {/* Small bright glint near the top of the table for that
              "polished gemstone" wink. */}
          <polygon
            points="45,20 51,20 48,24"
            fill="white"
            opacity="0.9"
          />
          {/* Tiny secondary sparkle on the right bezel. */}
          <circle cx="78" cy="35" r="1.6" fill="white" opacity="0.75" />
        </g>
      </svg>
    </span>
  );
}

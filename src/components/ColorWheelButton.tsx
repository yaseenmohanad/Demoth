"use client";

interface Props {
  value: string;
  onChange: (color: string) => void;
  /** Visual size in tailwind units, e.g. 7 → h-7 w-7. */
  size?: 6 | 7;
  title?: string;
}

/**
 * A circular swatch with a rainbow hue gradient that opens the system
 * color picker on click. Sits alongside the preset color swatches so the
 * user can pick any custom color.
 */
export default function ColorWheelButton({
  value,
  onChange,
  size = 7,
  title = "Custom color",
}: Props) {
  const sizeClass = size === 7 ? "h-7 w-7" : "h-6 w-6";

  return (
    <label
      title={title}
      className={`relative ${sizeClass} shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-[var(--border)] ring-2 ring-transparent transition-all hover:scale-110 hover:ring-[var(--primary)]`}
      style={{
        background:
          "conic-gradient(from 90deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
      }}
    >
      {/* tiny inner dot showing the currently-selected color */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow"
        style={{ background: value }}
      />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

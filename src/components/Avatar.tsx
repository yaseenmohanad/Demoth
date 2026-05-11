"use client";

import { UserIcon } from "./Icons";

interface Props {
  name?: string;
  src?: string | null;
  size?: number;
  className?: string;
}

/**
 * Circular avatar that falls back to a user-icon glyph when no image is set.
 * `src` is a data URL or remote URL; `size` is in pixels.
 */
export default function Avatar({
  name,
  src,
  size = 40,
  className = "",
}: Props) {
  const dimension = { width: size, height: size };
  const alt = name ? `${name}'s profile picture` : "Profile picture";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        style={dimension}
        className={`shrink-0 rounded-full object-cover ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <div
      style={dimension}
      role="img"
      aria-label={alt}
      className={`grid shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] ${className}`}
    >
      <UserIcon size={Math.max(12, Math.round(size * 0.55))} />
    </div>
  );
}

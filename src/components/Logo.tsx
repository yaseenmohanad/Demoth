"use client";

import Image from "next/image";

interface Props {
  /** Visual size in pixels (used for both width and height). */
  size?: number;
  /** No-op now — the previous SVG diamond logo spun via CSS. The new
   *  PNG mark is static, but the prop is kept on the type so existing
   *  call sites (`<Logo spinning={false} />`) don't break. */
  spinning?: boolean;
  className?: string;
}

/**
 * Demoth's brand mark — the t-shirt + needle illustration with the
 * wordmark underneath. Lives in /public/demoth-logo.png. Rendered
 * via next/image so it's optimised by Next at request time.
 *
 * Sized square; the underlying image is square with the icon
 * centered, so object-fit isn't needed. We do pass `priority` for
 * larger renderings (home hero, premium upsell) so they're not
 * deferred behind lazy-loading.
 */
export default function Logo({
  size = 32,
  className = "",
}: Props) {
  return (
    <Image
      src="/demoth-logo.png"
      alt="Demoth"
      width={size}
      height={size}
      priority={size >= 64}
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

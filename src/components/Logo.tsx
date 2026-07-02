"use client";

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
 * as a plain <img> so it displays instantly without waiting on
 * Next's on-demand image optimization endpoint (which is noticeably
 * slow in dev). The file is already small (~1.4 MB) and cached
 * aggressively by browsers, so we don't need Next.js's resizing here.
 */
export default function Logo({
  size = 32,
  className = "",
}: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/demoth-logo.png"
      alt="Demoth"
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

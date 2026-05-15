import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Wikimedia and similar sites reject generic browser UAs — they want one that
// identifies the app (their UA policy). Other sites (Pinterest, etc.) want a
// browser UA for hot-link compatibility. We try a friendly UA first, then
// retry with a browser UA if the first attempt fails.
const FRIENDLY_UA =
  "DemothImageProxy/1.0 (https://demoth.local)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function sniffFromPath(pathname: string): string | null {
  const dot = pathname.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = pathname.slice(dot + 1).toLowerCase().split(/[?#]/)[0];
  return EXT_TYPES[ext] ?? null;
}

/**
 * Detect image MIME from the actual file bytes (magic numbers). Far more
 * reliable than the upstream Content-Type header — many hosts return
 * `text/html`, `application/octet-stream`, or wrong types for valid images.
 */
function sniffFromBytes(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf);
  if (b.length < 4) return null;

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return "image/png";
  // GIF: 47 49 46 38 ("GIF8")
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  // BMP: 42 4D ("BM")
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  // ICO: 00 00 01 00
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00)
    return "image/x-icon";
  // RIFF????WEBP — WebP
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  // ISO-BMFF (HEIC/AVIF/HEIF): bytes 4..7 are "ftyp", brand follows
  if (
    b.length >= 12 &&
    b[4] === 0x66 &&
    b[5] === 0x74 &&
    b[6] === 0x79 &&
    b[7] === 0x70
  ) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "heim" ||
      brand === "heis" ||
      brand === "mif1" ||
      brand === "msf1"
    )
      return "image/heic";
  }
  // SVG (XML or raw): look at first ~1KB for "<svg"
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(b.slice(0, Math.min(b.length, 1024)))
    .trim()
    .toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    if (head.includes("<svg")) return "image/svg+xml";
  }
  return null;
}

/**
 * Look for an embeddable image URL in HTML — og:image, twitter:image, or the
 * legacy `<link rel="image_src">`. Used when the user pastes a webpage URL
 * (e.g. a stock-photo product page) instead of the raw image URL.
 */
function extractImageFromHtml(html: string, baseUrl: URL): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image:secure_url["']/i,
    /<meta[^>]*property=["']og:image:url["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image:url["']/i,
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try {
        return new URL(
          m[1].replace(/&amp;/g, "&"),
          baseUrl.toString()
        ).toString();
      } catch {
        // skip malformed
      }
    }
  }
  return null;
}

/**
 * Proxies a remote image through our origin. Avoids CORS, hotlink blocking,
 * and mixed-content issues when adding images to a design.
 *
 * Usage: /api/image-proxy?url=<encoded-https-url>
 */
export async function GET(request: Request) {
  return handle(request, 0);
}

async function handle(
  request: Request,
  redirectDepth: number
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");

  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return NextResponse.json({ error: "Bad protocol" }, { status: 400 });
  }

  /**
   * Hosts vary widely in what they accept:
   *  - Some require a browser User-Agent (Pinterest, certain CDNs)
   *  - Some require an identifying UA (Wikimedia)
   *  - Some block requests where the Referer mismatches their domain
   *  - Some require NO Referer at all
   *  - Some allow a Google Referer (cached image protection)
   *
   * We try a sequence of combinations until one returns a 2xx response,
   * then fall through to the bytes-based content-type sniff below. The
   * Accept header advertises HTML too — if the user pasted a webpage URL,
   * we want to fetch the page so we can extract its og:image preview.
   */
  async function tryFetch(
    ua: string,
    referer?: string
  ): Promise<Response | null> {
    // Send a complete set of browser-like headers. Anti-bot systems
    // (Cloudflare, Akamai, etc.) look for Sec-Fetch-* and Sec-Ch-Ua hints
    // and reject requests that omit them, even if the User-Agent looks fine.
    const headers: Record<string, string> = {
      "User-Agent": ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": referer ? "cross-site" : "none",
      "Sec-Fetch-User": "?1",
      "Sec-Ch-Ua":
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    };
    if (referer) headers.Referer = referer;
    try {
      return await fetch(url.toString(), { headers });
    } catch {
      return null;
    }
  }

  const sameOrigin = `${url.protocol}//${url.host}/`;
  const attempts: Array<{ ua: string; referer?: string }> = [
    { ua: BROWSER_UA, referer: sameOrigin },
    { ua: BROWSER_UA, referer: undefined }, // no Referer at all
    { ua: BROWSER_UA, referer: "https://www.google.com/" },
    { ua: BROWSER_UA, referer: "https://www.bing.com/" },
    { ua: FRIENDLY_UA, referer: undefined },
    { ua: FRIENDLY_UA, referer: sameOrigin },
  ];

  let upstream: Response | null = null;
  let lastStatus: number | string = "unreachable";
  for (const a of attempts) {
    const res = await tryFetch(a.ua, a.referer);
    if (res?.ok) {
      upstream = res;
      break;
    }
    if (res) lastStatus = res.status;
  }

  if (!upstream) {
    return NextResponse.json(
      { error: `Upstream ${lastStatus}` },
      { status: 502 }
    );
  }

  // If the user pasted a webpage URL (HTML), look for an og:image preview
  // and follow it. Limit recursion depth so we don't chase loops.
  const upstreamType =
    upstream.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (
    redirectDepth < 2 &&
    (upstreamType === "text/html" ||
      upstreamType === "application/xhtml+xml" ||
      upstreamType.startsWith("text/"))
  ) {
    const html = await upstream.text();
    const candidate = extractImageFromHtml(html, url);
    if (candidate) {
      const followUrl =
        new URL(request.url).origin +
        `/api/image-proxy?url=${encodeURIComponent(candidate)}`;
      return handle(new Request(followUrl), redirectDepth + 1);
    }
    return NextResponse.json(
      {
        error:
          "That looks like a webpage URL, not an image. Right-click the image and pick 'Copy image address'.",
      },
      { status: 415 }
    );
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "Empty response" }, { status: 502 });
  }

  const rawType =
    upstream.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";

  // Resolve the content-type using three signals, in order:
  //   1. Upstream header if it's a real image/* type
  //   2. Magic bytes (most reliable — works even when the host lies)
  //   3. URL extension
  let contentType: string | null = null;
  if (rawType.startsWith("image/")) {
    contentType = rawType;
  }
  if (!contentType) {
    contentType = sniffFromBytes(buf);
  }
  if (!contentType) {
    contentType = sniffFromPath(url.pathname);
  }
  // If the upstream sent a generic stream type, accept the bytes as JPEG by
  // default — most blob storage CDNs do this for photos.
  if (
    !contentType &&
    (rawType === "application/octet-stream" ||
      rawType === "binary/octet-stream" ||
      rawType === "")
  ) {
    contentType = "image/jpeg";
  }

  if (!contentType) {
    return NextResponse.json(
      {
        error: `Not an image (host sent: ${rawType || "no content-type"})`,
      },
      { status: 415 }
    );
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      // `private` keeps the response in the user's browser cache (so the
      // same thumbnail loads instantly on repeat) but tells shared caches
      // — Netlify's edge specifically — to skip it. Netlify's edge was
      // caching by path only, ignoring the ?url= query, so every request
      // returned whatever image was first cached. The explicit Netlify /
      // CDN variants below belt-and-braces that.
      "Cache-Control": "private, max-age=86400",
      "Netlify-CDN-Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    },
  });
}

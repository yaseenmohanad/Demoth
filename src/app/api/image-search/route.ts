import { NextResponse } from "next/server";

// Runs on Cloudflare via OpenNext + the `nodejs_compat` flag, which
// gives us the full Node runtime — no need to force the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImageResult {
  thumb: string;
  full: string;
  title: string;
}

/**
 * Image search endpoint for the design studio's "Add image" flow.
 *
 * We used to scrape Bing's image-search HTML, but from Cloudflare
 * Workers IPs Bing routinely bot-detected us and served completely
 * unrelated cached pages (search "sunset" → get cruise-ship images,
 * search "moth" → get French real estate listings, etc.). Switched
 * to the Openverse API — a free, keyless public API for openly-
 * licensed images. Bonus: everything Openverse returns is Creative
 * Commons or public-domain, so users can put these into their designs
 * without worrying about copyright.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ images: [] satisfies ImageResult[] });
  }

  // Openverse anonymous requests cap page_size at 20 per call. Fire
  // 3 pages in parallel to build up a ~60-image grid.
  const PAGE_SIZE = 20;
  const PAGES = 3;
  const urls = Array.from(
    { length: PAGES },
    (_, i) =>
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
        q
      )}&page_size=${PAGE_SIZE}&page=${i + 1}&format=json`
  );

  const responses = await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u, {
          headers: {
            Accept: "application/json",
            // Openverse asks for an identifying UA. Ours points at
            // the Demoth repo so they can reach out if they need to.
            "User-Agent":
              "Demoth/1.0 (+https://github.com/yaseenmohanad/Demoth)",
          },
          cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as OpenverseResponse;
      } catch {
        return null;
      }
    })
  );

  // If EVERY page failed we surface an upstream error; a single bad
  // page just gets skipped.
  if (responses.every((r) => r === null)) {
    return NextResponse.json(
      { images: [], error: "Openverse upstream unavailable" },
      { status: 502 }
    );
  }

  // Map Openverse rows to the {thumb, full, title} shape the front-end
  // has always expected. Drop entries missing a usable URL so we never
  // hand the grid a card it can't render, and de-dupe by url so
  // pages that overlap don't show the same picture twice.
  const seen = new Set<string>();
  const images: ImageResult[] = [];
  for (const raw of responses) {
    for (const r of raw?.results ?? []) {
      if (!r?.url) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      images.push({
        full: r.url,
        thumb: r.thumbnail || r.url,
        title: (r.title ?? "").trim().slice(0, 120),
      });
    }
  }

  return NextResponse.json(
    { images },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    }
  );
}

// ---- Openverse response shape (subset we care about) ---------------------
interface OpenverseImage {
  id?: string;
  title?: string;
  /** Original / full-resolution URL. */
  url: string;
  /** Sized-down preview URL, roughly ~640px on the longest side. Can
   *  sometimes be missing on very small entries; we fall back to `url`. */
  thumbnail?: string;
  creator?: string;
  creator_url?: string;
  license?: string;
}

interface OpenverseResponse {
  result_count?: number;
  page_count?: number;
  results?: OpenverseImage[];
}

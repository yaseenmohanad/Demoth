import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BingResult {
  thumb: string;
  full: string;
  title: string;
}

// Rotate User-Agents across parallel requests so Bing doesn't bot-detect us
// and start returning a stripped-down (1-result) page.
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ images: [] satisfies BingResult[] });
  }

  // Hit the regular search page across multiple offsets. The async fragment
  // endpoint is more aggressively rate-limited, while /images/search behaves
  // consistently when we rotate User-Agents.
  const offsets = [1, 35, 70];
  const targets = offsets.map(
    (first) =>
      `https://www.bing.com/images/search?q=${encodeURIComponent(
        q
      )}&form=HDRSC2&first=${first}&count=35&safesearch=Moderate`
  );

  const pages = await Promise.all(
    targets.map(async (url, i) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": USER_AGENTS[i % USER_AGENTS.length],
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          cache: "no-store",
        });
        if (!res.ok) return "";
        return await res.text();
      } catch {
        return "";
      }
    })
  );

  const html = pages.join("\n");
  if (!html) {
    return NextResponse.json(
      { images: [], error: "Upstream fetch failed" },
      { status: 502 }
    );
  }

  const images: BingResult[] = [];
  const seen = new Set<string>();

  /**
   * Bing wraps each image result in a metadata blob. Two HTML formats appear
   * in the wild:
   *   - m='{"murl":"...","turl":"...","t":"..."}'      (raw JSON, single-quoted)
   *   - m="{&quot;murl&quot;:&quot;...&quot;,...}"     (HTML-entity encoded)
   * We try both and decode entities for the second case.
   */
  const candidates: string[] = [];

  // Single-quoted variant
  const reSingle = /\sm='(\{[^']+?\})'/g;
  let m: RegExpExecArray | null;
  while ((m = reSingle.exec(html)) !== null) candidates.push(m[1]);

  // Double-quoted, HTML-entity encoded variant
  const reDouble = /\sm="(\{(?:&quot;|[^"])+?\})"/g;
  while ((m = reDouble.exec(html)) !== null) {
    candidates.push(decodeHtmlEntities(m[1]));
  }

  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw) as {
        murl?: string;
        turl?: string;
        t?: string;
      };
      if (!obj.murl || !obj.turl) continue;
      if (seen.has(obj.murl)) continue;
      seen.add(obj.murl);
      images.push({
        full: obj.murl,
        thumb: obj.turl,
        title: stripTags((obj.t ?? "").slice(0, 200)).slice(0, 120),
      });
      if (images.length >= 60) break;
    } catch {
      // skip malformed entry
    }
  }

  return NextResponse.json({ images });
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

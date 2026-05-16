/**
 * Lightweight word suggester for the text element editor. Picks a handful
 * of common English words that are close (by edit distance) to whatever
 * the user just typed. Doesn't auto-replace anything — the studio renders
 * these as chips and the user taps one to apply.
 *
 * The dictionary is intentionally small (~350 words) so we keep the bundle
 * tiny. It leans toward words you might actually put on a t-shirt.
 */

// Roughly ordered by frequency / shirt-ness.
const COMMON_WORDS = [
  // top of english frequency
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
  "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
  "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
  "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
  "even", "new", "want", "any", "these", "give", "day", "most", "us", "is",
  "are", "was", "were", "been", "has", "had", "did", "does", "going", "got",
  // pronouns / contractions
  "I'm", "you're", "we're", "they're", "he's", "she's", "it's", "that's",
  "don't", "doesn't", "didn't", "can't", "won't", "isn't", "aren't", "wasn't",
  "weren't", "haven't", "hasn't", "hadn't", "wouldn't", "couldn't", "shouldn't",
  "I've", "you've", "we've", "they've", "I'll", "you'll", "we'll", "they'll",
  // common short words & connectors
  "yes", "no", "ok", "okay", "hi", "hey", "hello", "bye", "thanks", "please",
  "for", "ten", "tea", "see", "sea", "new", "old", "big", "let", "got",
  // shirt-ish vocabulary
  "love", "life", "live", "free", "wild", "real", "true", "fire", "cool",
  "hot", "best", "great", "boss", "king", "queen", "prince", "princess",
  "champion", "winner", "legend", "dream", "dreamer", "hero", "vibes",
  "mood", "lit", "epic", "fresh", "fancy", "sweet", "happy", "lucky",
  "magic", "magical", "shine", "shiny", "glow", "spark", "spirit",
  "soul", "heart", "mind", "body", "force", "power", "energy",
  "summer", "winter", "spring", "autumn", "sun", "moon", "star", "sky",
  "ocean", "river", "mountain", "forest", "beach", "park", "city",
  "world", "earth", "planet", "galaxy", "space", "universe",
  "music", "song", "band", "team", "club", "crew", "squad", "gang",
  "family", "friend", "friends", "buddy", "bro", "sis", "mom", "dad",
  "boy", "girl", "kid", "kids", "baby", "lady", "guy", "man", "woman",
  "cat", "dog", "fox", "wolf", "bear", "tiger", "lion", "shark", "eagle",
  "dragon", "phoenix", "unicorn", "panda", "fish", "bird", "horse",
  // colors
  "red", "blue", "green", "yellow", "purple", "pink", "black", "white",
  "gold", "silver", "neon", "violet", "orange", "rainbow",
  // emojis-in-words
  "smile", "laugh", "cry", "wink", "kiss", "hug",
  // verbs of action
  "run", "jump", "fly", "swim", "dance", "sing", "play", "ride",
  "skate", "surf", "climb", "win", "lose", "draw", "design", "make",
  "build", "create", "dream", "shine", "rise", "fall", "break",
  // brand-ish
  "demoth", "studio", "creator", "designer", "artist", "maker",
  // sentiment
  "yes", "yeah", "yo", "wow", "omg", "lol", "lmao", "rofl",
];

const FREQUENCY: Record<string, number> = {};
COMMON_WORDS.forEach((w, i) => {
  // Earlier in the list = more frequent. Map to a rank.
  if (!(w.toLowerCase() in FREQUENCY) || FREQUENCY[w.toLowerCase()] > i) {
    FREQUENCY[w.toLowerCase()] = i;
  }
});

// Distinct list of lowercased words (dedup)
const VOCAB = Array.from(
  new Set(COMMON_WORDS.map((w) => w.toLowerCase()))
);
// Original-cased map so we can suggest words with apostrophes capitalised right
const CASE_PREFER: Record<string, string> = {};
for (const w of COMMON_WORDS) {
  const key = w.toLowerCase();
  if (!(key in CASE_PREFER)) CASE_PREFER[key] = w;
}

function levenshtein(a: string, b: string, max: number): number {
  // Early-bail variant: if intermediate distance exceeds `max`, return Infinity.
  if (Math.abs(a.length - b.length) > max) return Infinity;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // Two-row DP
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

function preserveCase(source: string, target: string): string {
  if (!source) return target;
  if (source === source.toUpperCase() && source.length > 1) return target.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

export interface WordSuggestion {
  /** The replacement, already case-matched to the user's input. */
  replacement: string;
  /** Edit distance from the typed word — lower = closer. */
  distance: number;
}

/**
 * Return up to `max` suggestions for a typed word. Returns an empty list
 * when the input matches a known word exactly (no need to suggest) or
 * when no close candidates exist.
 */
export function suggestWords(input: string, max = 4): WordSuggestion[] {
  const word = input.trim();
  if (word.length < 2) return [];
  const lower = word.toLowerCase();

  // Don't suggest anything when the user has already typed a real word.
  // Apostrophe-stripped lookup so "dont" still matches "don't".
  const stripped = lower.replace(/[^a-z]/g, "");
  for (const v of VOCAB) {
    const vStripped = v.replace(/[^a-z]/g, "");
    if (v === lower || vStripped === stripped) {
      // Exact match (case-insensitive). Skip suggestions — but if the
      // user typed without an apostrophe and there's an apostrophe'd
      // canonical form, still suggest that one.
      if (v !== lower) {
        return [
          {
            replacement: preserveCase(word, CASE_PREFER[v] ?? v),
            distance: 0,
          },
        ];
      }
      return [];
    }
  }

  // Scan vocabulary, keep candidates within distance ≤ 2.
  const maxDist = lower.length <= 4 ? 1 : 2;
  const candidates: Array<{ word: string; dist: number; freq: number }> = [];
  for (const v of VOCAB) {
    if (Math.abs(v.length - lower.length) > maxDist) continue;
    const d = levenshtein(lower, v, maxDist);
    if (d === Infinity || d === 0) continue;
    candidates.push({
      word: CASE_PREFER[v] ?? v,
      dist: d,
      freq: FREQUENCY[v] ?? 9999,
    });
  }
  candidates.sort((a, b) => a.dist - b.dist || a.freq - b.freq);
  const top = candidates.slice(0, max);
  return top.map((c) => ({
    replacement: preserveCase(word, c.word),
    distance: c.dist,
  }));
}

/**
 * Inspect a text string and return the "currently-being-edited" word (the
 * trailing word, or the word just before a trailing space/punctuation),
 * along with its position so a chip-tap can replace it precisely.
 */
export function trailingWord(
  text: string
): { word: string; start: number; end: number } | null {
  const trimmed = text.replace(/[\s.,!?;:]+$/, "");
  if (!trimmed) return null;
  const m = trimmed.match(/(\S+)$/);
  if (!m) return null;
  const word = m[1];
  // Skip pure-numeric or symbol-only tokens
  if (!/[A-Za-z]/.test(word)) return null;
  const end = trimmed.length;
  const start = end - word.length;
  return { word, start, end };
}

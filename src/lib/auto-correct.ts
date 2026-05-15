/**
 * Tiny dictionary-based auto-correct, applied to text-element edits in the
 * studio when the user has premium and the toggle is on. The intent is just
 * to fix the obvious typos a kid would make while putting words on a shirt
 * — not to be a full spell checker. Browser-native spellcheck still runs
 * underneath for the rest.
 */

const TYPOS: Record<string, string> = {
  teh: "the",
  taht: "that",
  thier: "their",
  recieve: "receive",
  recieved: "received",
  alot: "a lot",
  freind: "friend",
  freinds: "friends",
  beleive: "believe",
  beleived: "believed",
  definately: "definitely",
  seperate: "separate",
  occured: "occurred",
  embarass: "embarrass",
  wich: "which",
  doens: "does",
  doesnt: "doesn't",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  im: "I'm",
  ive: "I've",
  isnt: "isn't",
  arent: "aren't",
  youre: "you're",
  theyre: "they're",
  hes: "he's",
  shes: "she's",
  thats: "that's",
  whats: "what's",
  wasnt: "wasn't",
  werent: "weren't",
  hasnt: "hasn't",
  havent: "haven't",
  hadnt: "hadn't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
};

function preserveCase(source: string, target: string): string {
  if (!source.length) return target;
  // ALL CAPS: HELLO -> HELLO
  if (source === source.toUpperCase()) return target.toUpperCase();
  // Title-cased: Hello -> Hello
  if (source[0] === source[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * Compute the next text value after the user typed `nextValue`, applying
 * auto-correct only when a word has just been completed (last typed char
 * is a space or sentence punctuation). Otherwise returns nextValue
 * unchanged. The previous value is needed so we don't try to "correct"
 * a deletion or a paste.
 */
export function autoCorrectOnInput(prevValue: string, nextValue: string): string {
  // Only correct on additions of length 1 (real typing) that end in a
  // word boundary character. Anything else — paste, IME, backspace — we
  // leave alone.
  if (nextValue.length !== prevValue.length + 1) return nextValue;
  const lastChar = nextValue[nextValue.length - 1];
  if (!/[\s.,!?;:]/.test(lastChar)) return nextValue;
  // Find the word immediately before the boundary char.
  const before = nextValue.slice(0, -1);
  const m = before.match(/(\w+)$/);
  if (!m) return nextValue;
  const word = m[1];
  const fix = TYPOS[word.toLowerCase()];
  if (!fix) return nextValue;
  const replaced = preserveCase(word, fix);
  return before.slice(0, before.length - word.length) + replaced + lastChar;
}

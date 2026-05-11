import type { Design } from "./types";

/**
 * The default name a brand-new design carries until the user renames it.
 * Kept in sync with the value used by `newDraft()` in DesignStudio.
 */
const DEFAULT_DESIGN_NAME = "Untitled design";

function isUnnamed(d: Design): boolean {
  const trimmed = d.name?.trim();
  return !trimmed || trimmed === DEFAULT_DESIGN_NAME;
}

/**
 * Resolve a design's display label. If the user gave it a real name, return
 * that. Otherwise fall back to "Draft N", where N is the design's 1-based
 * position among all unnamed designs in the supplied list (in the order
 * given). Pass the full list of designs you're rendering so the numbering
 * stays consistent across the UI.
 */
export function displayName(design: Design, list: readonly Design[]): string {
  if (!isUnnamed(design)) return design.name;
  const draftIndex = list
    .filter(isUnnamed)
    .findIndex((d) => d.id === design.id);
  // -1 should be impossible (design itself is in the list) but be defensive.
  return `Draft ${draftIndex < 0 ? 1 : draftIndex + 1}`;
}

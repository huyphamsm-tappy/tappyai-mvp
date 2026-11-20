// Sizes of the chat typing box and of a long question once it is sent (owner 20/11/2026). Pure.
//   · the typing box grows with the text up to COMPOSER_MAX_PX, then it SCROLLS: it used to be capped at 160px with overflow hidden, so a long question could not be scrolled with the mouse wheel;
//   · a sent question of many characters or lines is shown folded under the person's bubble, with "show more" (needsCollapse).

export const COMPOSER_MAX_PX = 240

/** The height to give the typing box for a measured scrollHeight, and whether it must show a scrollbar. */
export function composerSizeFor(scrollHeightPx: number): { heightPx: number; scrollable: boolean } {
  const h = Number.isFinite(scrollHeightPx) && scrollHeightPx > 0 ? scrollHeightPx : 44
  return { heightPx: Math.min(h, COMPOSER_MAX_PX), scrollable: h > COMPOSER_MAX_PX }
}

export const COLLAPSE_CHARS = 600
export const COLLAPSE_LINES = 8

/** Does a sent question fold under its bubble? */
export function needsCollapse(text: string): boolean {
  if (typeof text !== 'string' || !text) return false
  return text.length >= COLLAPSE_CHARS || text.split('\n').length >= COLLAPSE_LINES
}

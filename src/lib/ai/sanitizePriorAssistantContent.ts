// Strip enrichment markdown and structured markers from a prior assistant turn
// BEFORE feeding it back into the model.
//
// The chat pipeline's output filter (streamEnrichment) removes system-owned
// enrichment when it re-emits reconstructed text on TOOL turns (bufferMode=true).
// On a tool-less follow-up ("Giá cả thế nào?", "cụ thể hơn", "chọn giúp tôi"),
// no PLACE_TOOL runs this turn, bufferMode stays false, and the stream filter
// forwards each `0:` frame live without stripping images, order-link markdown, or
// [TAPPY_PLAN]/[CTA_BUTTONS]/[FOLLOWUPS] markers.
//
// The only guard against the model re-emitting those on a follow-up is a
// prompt-level rule ("HE THONG tu chen — ban KHONG viet"). That is not a
// structural guarantee: the LLM has the previous turn's full markdown in its
// context and sometimes copies it, and when it does the client re-renders the
// same recommendation cards even though the user did not ask for a new search.
//
// This helper removes those elements from prior assistant text so the model
// cannot echo what it cannot read. Applied ONLY to the messages fed to the
// model — the memory extractor still sees the raw history because it summarizes
// what happened, not what to write next.
//
// Deliberately conservative: it strips ONLY system-owned decorations. Prose,
// place names, ratings, addresses, prices, and every fact the model needs to
// answer "how much is it?" survive unchanged.

const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)\s]+\)/g

const TAPPY_PLAN_BLOCK = /\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g
const TAPPY_SHOPPING_BLOCK = /\[TAPPY_SHOPPING\][\s\S]*?\[\/TAPPY_SHOPPING\]/g
// Same shape ChatInterface parses: closed pair, or bare marker followed by
// {...} at end of content.
const CTA_BUTTONS_CLOSED = /\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g
const CTA_BUTTONS_BARE_TAIL = /\[CTA_BUTTONS\]\s*\{[\s\S]*?\}\s*$/g
// Same shape ChatInterface parses: single line, closed pair or newline-terminated.
const FOLLOWUPS_LINE = /\[FOLLOWUPS\][^\n]*?(?:\[\/FOLLOWUPS\]|(?=\n|$))/g

/**
 * Return `content` with structured markers and enrichment markdown removed.
 * Idempotent — running twice gives the same result as once.
 */
export function sanitizePriorAssistantContent(content: string): string {
  if (!content) return content
  let out = content
  out = out.replace(TAPPY_PLAN_BLOCK, '')
  out = out.replace(TAPPY_SHOPPING_BLOCK, '')
  out = out.replace(CTA_BUTTONS_CLOSED, '')
  out = out.replace(CTA_BUTTONS_BARE_TAIL, '')
  out = out.replace(FOLLOWUPS_LINE, '')
  out = out.replace(MARKDOWN_IMAGE, '')
  // Collapse the blank runs the removals leave behind, but never touch a single
  // paragraph break — the prose reads the same as it did before.
  out = out.replace(/[ \t]+\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

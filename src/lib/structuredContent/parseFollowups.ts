// ── The [FOLLOWUPS] reader ───────────────────────────────────────────────────
//
// 🔑 MOVED HERE FROM `ChatInterface.tsx`, UNCHANGED, so the G1 shared-result sanitizer can
// strip the block on the server without importing a 'use client' module. One wire format,
// one reader; `ChatInterface` re-exports it.

// Optional follow-up suggestions the model may emit at the very end.
// Rendered as tappable chips (only on the latest reply) — a helpful next step,
// never a push. MFS 2.7.
export function parseFollowups(content: string): { text: string; followups: string[] } {
  // The model is meant to emit a single-line [FOLLOWUPS]a|b|c[/FOLLOWUPS] block,
  // but it sometimes omits/malforms the closing tag (and stream enrichment appends
  // an image block after it). Bound extraction to the followups LINE so a missing
  // close tag can never leak the raw marker or swallow trailing content.
  const m = content.match(/\[FOLLOWUPS\]([^\n]*?)(?:\[\/FOLLOWUPS\]|\n|$)/i)
  let followups: string[] = []
  let text = content
  if (m) {
    followups = m[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 3)
    text = content.replace(/\[FOLLOWUPS\][^\n]*?(?:\[\/FOLLOWUPS\]|\n|$)/i, '')
  }
  // Safety net: strip any stray/orphan markers so implementation details are
  // never visible to the user, even on malformed output.
  text = text.replace(/\[\/?FOLLOWUPS\]/gi, '').trimEnd()
  return { text, followups }
}

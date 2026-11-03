// ── Wave 3 (W5, review finding F6) — the titles of the products a user points at, as they enter the prompt ───────────────────────────────────────────────
//
// With CONSULT_THREAD_AWARE_ASK a message that points at a shown product ("cái UAG đó") is read from the card the previous reply carried, and the router hands the product's TITLE on as `refers`. That
// title is third-party text from a shopping result that came back through the client; it is the one string of the turn that reached the system prompt without the DATA fence every tool result gets.
// With the flag on it is fenced here (source `tool_result`: it IS a tool result's field), and a fence marker inside it is neutralised by the fence itself. With the flag off nothing changes (the
// prompt stays byte for byte what it was). Pure.

import { fenceUntrusted } from '../security/fence'

export function referTitlesForPrompt(refers: readonly string[], fenced: boolean): string {
  const joined = refers.join(' | ')
  return fenced ? fenceUntrusted('tool_result', joined) : joined
}

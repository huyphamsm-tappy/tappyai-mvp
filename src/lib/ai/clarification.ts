// ── Counting what the user is actually being asked ───────────────────────────
//
// The response contract is "at most ONE clarification request per turn".
// Counting "?" does not measure that, and measuring it wrongly is how C2 first
// reported a failure it did not have:
//
//   • [CTA_BUTTONS], [FOLLOWUPS] and [TAPPY_PLAN] are machine-read blocks the
//     clients strip before display — nothing in them is asked of the user;
//   • every marketplace/maps URL carries "?q=" or "?ss=";
//   • a parenthetical rephrasing asks the SAME thing twice —
//     "Bạn đi ngày nào?** (hoặc khoảng nào trong tháng 8?)" is one thing to
//     answer, and naive counting scored it 2;
//   • quoting the user's own question back is not a new request.
//
// Measurement only — nothing in the request path calls this. It exists so the
// contract can be asserted deterministically in tests and in the behavioural
// probe, rather than argued about.

const STRUCTURED_BLOCK_MARKERS = ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]']

/** Text the user actually reads: everything before the first structured block. */
function proseOnly(reply: string): string {
  let end = reply.length
  for (const marker of STRUCTURED_BLOCK_MARKERS) {
    const i = reply.indexOf(marker)
    if (i !== -1 && i < end) end = i
  }
  return reply.slice(0, end)
}

/**
 * How many distinct things this reply asks the user to answer.
 *
 * 0 and 1 satisfy the contract; 2 or more is a violation.
 */
export function countClarificationQuestions(reply: string): number {
  let text = proseOnly(reply ?? '')

  // Markdown links first (their label may contain punctuation), then bare URLs.
  text = text.replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/https?:\/\/\S+/g, ' ')

  // Quoting the user back — straight and curly quotes.
  text = text.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ').replace(/'[^']*'/g, ' ')

  // A parenthetical restates or softens the question it follows; it is not a
  // second thing to answer.
  text = text.replace(/\([^)]*\)/g, ' ')

  return (text.match(/\?/g) || []).length
}

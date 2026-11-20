// The one fact a turn needs when the account has used up its monthly Deep Research reports (owner 20/11/2026). The chat then runs the question in Thinking mode (a full, careful answer) instead of
// refusing it, and gives the model this plan fact so the person is told, once and briefly, why and when the reports come back. Pure. Plan data only: it carries no rule about HOW to answer.

/** The first day of the next month, for a VN date `YYYY-MM-DD`. */
export function nextMonthStartVn(today: string): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

export function deepExhaustedBlock(o: { limit: number; resetOn: string }): string {
  return [
    '[Plan fact]',
    `This account has used all ${o.limit} of its Deep Research reports for this month; they come back on ${o.resetOn} (Vietnam time).`,
    'This turn runs in Thinking mode: answer the question fully and carefully.',
    'Mention the report allowance once, in one short sentence, in the language of the person\'s message. Do not dwell on it.',
  ].join('\n')
}

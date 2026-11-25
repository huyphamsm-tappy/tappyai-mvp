// When an account has used up its monthly Deep Research reports (owner 20/11/2026) the chat runs the question in Thinking mode instead of refusing it, and tells the PERSON (not the model) with one
// fixed note under the answer: the server sends the date the reports come back in the `x-tappy-deep-reset` header and the page draws the sentence in the person's language. The model is told
// nothing: a first real run showed it names the limit sometimes and forgets it the next time, and the brain stays exactly as it was. Pure.

export const DEEP_RESET_HEADER = 'x-tappy-deep-reset'

/** The first day of the next month, for a VN date `YYYY-MM-DD`. */
export function nextMonthStartVn(today: string): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

/** `2026-12-01` → `01/12/2026` (Vietnam day-first), for the note. A value that is not a date comes back unchanged. */
export function displayResetDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

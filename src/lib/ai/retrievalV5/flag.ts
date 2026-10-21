// RETRIEVAL_V5 (owner 20/10/2026, "bỏ OpenAI web search, giữ Serper"): the lookup of a V4 turn is FIND → READ → GAP-FILL → WRITE ONCE on Serper +
// Tappy's own page reader (research.ts). Default OFF; on top of TAPPY_ANSWER_V4 only (it uses the V4 stack). With it on, OpenAI's hosted web
// search is never used.
export function retrievalV5Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.RETRIEVAL_V5 ?? '').trim() === '1'
}

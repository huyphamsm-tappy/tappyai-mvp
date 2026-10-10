// ── CONSULTATIVE_IN_AGENT — the consultative voice and advice principles on the agent runtime (TAPPY_AGENT=2) ──────────────────
//
// OFF by default. ON only when BOTH hold: the server env CONSULTATIVE_IN_AGENT is 1 / true / on, and the agent runtime is the one running
// (TAPPY_AGENT=2). With the flag off nothing that depends on it changes: the prompt is byte-identical, no memory line is added to the
// data block, and the pick-sentence rewrite still runs. No imports on purpose: both the prompt module and consultative/luna.ts read it.

export function consultativeInAgentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CONSULTATIVE_IN_AGENT ?? '').trim().toLowerCase()
  return (v === '1' || v === 'true' || v === 'on') && env.TAPPY_AGENT === '2'
}

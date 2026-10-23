/**
 * LEGACY_STREAM_TRACE (default OFF) — per-stage observability for the legacy stream filter.
 *
 * `guardTrace` is wired only on the agent path (route.ts, TAPPY_AGENT=2), so the default path
 * has no record of which settle-path stage changed a reply. ON: one `tappyai_guard` line per
 * changed stage and one per turn, with COUNTS ONLY — never reply text, never a claim value.
 * Read at call time. OFF: no trace object is created and no line is written.
 */

const AMOUNT_RE = /\d{1,3}(?:\.\d{3})+/g
const SENTENCE_BREAK_RE = /(?<=[.!?…])\s+|\n+/

export function legacyStreamTraceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.LEGACY_STREAM_TRACE?.trim()
  return v === '1' || v === 'true'
}

function countSentences(text: string): number {
  return text.split(SENTENCE_BREAK_RE).filter(s => s.trim() !== '').length
}

/** Structured thousands-separated amounts ("8.000.000"). A pattern count, not a VERIFIED verdict — the verdict is not known at a stage. */
function countAmounts(text: string): number {
  return text.match(AMOUNT_RE)?.length ?? 0
}

export interface LegacyStreamTrace {
  stage(name: string, before: string, after: string): void
  turn(): void
}

export function createLegacyStreamTrace(log: (line: string) => void = line => console.log(line)): LegacyStreamTrace {
  let charsIn: number | null = null
  let charsOut = 0
  let changed = 0
  const emit = (rec: Record<string, unknown>): void => {
    try { log(JSON.stringify({ type: 'tappyai_guard', ...rec })) } catch { /* trace only */ }
  }
  return {
    stage(name, before, after) {
      charsIn ??= before.length
      charsOut = after.length
      changed++
      const amountsBefore = countAmounts(before)
      const amountsAfter = countAmounts(after)
      emit({
        guard: 'legacy_stage', stage: name,
        chars_before: before.length, chars_after: after.length,
        sentences_removed: Math.max(0, countSentences(before) - countSentences(after)),
        amounts_before: amountsBefore, amounts_after: amountsAfter,
        amount_removed: amountsAfter < amountsBefore,
      })
    },
    turn() {
      if (changed === 0 || !charsIn) return
      emit({
        guard: 'legacy_turn', stages_changed: changed,
        chars_in: charsIn, chars_out: charsOut,
        net_removed_share: Math.round((1 - charsOut / charsIn) * 1000) / 1000,
      })
    },
  }
}

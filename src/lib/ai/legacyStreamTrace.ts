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

/**
 * `always` (one brain, P2-8): the per-turn line is written even when no stage changed anything, with zeros - so "removed nothing" is distinct from "no trace".
 * The turn line also carries the TOTAL the turn lost: `chars_removed_total` is the sum, over the stages that shortened the text, of what each removed (a stage that
 * only adds text cannot cancel an earlier removal); `removed_by_stage` breaks it down. A `shadow:` stage (logged, the text kept) is counted apart, as what WOULD have gone.
 */
export function createLegacyStreamTrace(log: (line: string) => void = line => console.log(line), opts: { always?: boolean } = {}): LegacyStreamTrace {
  let charsIn: number | null = null
  let charsOut = 0
  let changed = 0
  let removedTotal = 0
  let wouldRemoveTotal = 0
  const removedBy: Record<string, number> = {}
  const wouldRemoveBy: Record<string, number> = {}
  const emit = (rec: Record<string, unknown>): void => {
    try { log(JSON.stringify({ type: 'tappyai_guard', ...rec })) } catch { /* trace only */ }
  }
  return {
    stage(name, before, after) {
      const shadow = name.startsWith('shadow:')
      const removed = Math.max(0, before.length - after.length)
      if (shadow) { if (removed > 0) { wouldRemoveTotal += removed; wouldRemoveBy[name] = (wouldRemoveBy[name] ?? 0) + removed } }
      else {
        charsIn ??= before.length
        charsOut = after.length
        if (removed > 0) { removedTotal += removed; removedBy[name] = (removedBy[name] ?? 0) + removed }
      }
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
      if (changed === 0 && opts.always) {
        emit({ guard: 'legacy_turn', stages_changed: 0, chars_removed_total: 0, removed_by_stage: {}, chars_would_remove_total: 0, would_remove_by_stage: {} })
        return
      }
      if (changed === 0) return
      emit({
        guard: 'legacy_turn', stages_changed: changed,
        ...(charsIn ? { chars_in: charsIn, chars_out: charsOut, net_removed_share: Math.round((1 - charsOut / charsIn) * 1000) / 1000 } : {}),
        chars_removed_total: removedTotal, removed_by_stage: removedBy,
        chars_would_remove_total: wouldRemoveTotal, would_remove_by_stage: wouldRemoveBy,
      })
    },
  }
}

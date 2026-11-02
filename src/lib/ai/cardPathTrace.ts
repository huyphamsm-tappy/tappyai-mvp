// ── CONSULTATIVE_IN_AGENT, audit-only: WHICH venues travel the card path of one turn ──────────────────────────────────────────────────
//
// Round 27 (Phase 2 of the "prose names MIA TOWN, the card shows another venue" investigation, chat 81d50b17 turn 1). The card is not built by the model that wrote the
// prose: a second call (the decision recorder, decisionRecord.ts) reads the answer and the candidate names, code validates its picks against the candidates, and only the
// matching picks become cards. The run trace records COUNTS of that step, not which venues. These events record which, with one correlation id per turn:
//   rows_and_recs        route.ts   rows the provider returned, rows the MODEL reads (first MODEL_ROWS_MAX), recommendations built for the card, rows dropped on the way
//   recorder_candidates  streamEnrichment.ts   every candidate (id + name) the settle path offers the recorder
//   recorder_input       decisionRecord.ts     the names the recorder REALLY receives (after de-duplication and the 12-name cap) and the names cut
//   recorder_output      decisionRecord.ts     the picks the recorder returned (names as written)
//   recorder_validation  decisionRecord.ts     per pick: matched / no candidate matches / duplicate / not named in the answer
//   ranking_applied      streamEnrichment.ts   per pick: the card (id) it matched; the card order before and after
//   final_cards          streamEnrichment.ts   the card ids / names in the order the client shows them
//   memory_context       route.ts   how many remembered-preference lines reached the data block, and whether one of them mentions walking (counts / booleans only)
//
// OFF unless the flag is on AND auditTraceOn() (auditTrace.ts): the collector carries `diagTurnId` only then, and every call below is a no-op without it. Observation only:
// nothing here changes which card is chosen.

import { auditTrace } from './auditTrace'

export function cardPathTrace(turn: string | undefined, stage: string, fields: Record<string, unknown> = {}): void {
  if (!turn) return
  auditTrace('card_path', 'snapshot', { ...fields, turn, stage })
}

/** id + name pairs (names are venue names from the provider rows, never user data); at most `max`. */
export function briefRows(rows: unknown, max = 40): Array<{ id: string | null; name: string | null }> {
  if (!Array.isArray(rows)) return []
  return rows.slice(0, max).map(r => {
    const o = (r ?? {}) as Record<string, unknown>
    const id = typeof o.place_id === 'string' && o.place_id ? o.place_id : typeof o.id === 'string' && o.id ? o.id : null
    return { id, name: typeof o.name === 'string' ? o.name : null }
  })
}

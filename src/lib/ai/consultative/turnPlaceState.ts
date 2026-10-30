// ── Which place search owns the turn's place state (one brain, review 30/10) ──────────────────────────────────────────────────────────
//
// With several tool calls in one step (2bbc14f), two search_places calls of one turn run side by side. The route wrote the turn's place
// state - the pick, the place location, the maps link, the candidate rows saved for "xem thêm" - from whichever call finished LAST, while
// the cards kept the FIRST non-empty set: a cafe search with no rows could leave a hotpot card set under the cafe search's maps link and
// save an empty candidate list. The first search that returns rows owns that state; an empty search may write only until one with rows
// comes. Off (every other route): every call writes, exactly as before. Decided synchronously (no await between the check and the claim).

export interface TurnPlaceOwner {
  /** May this search_places call (with `rows` result rows) write the turn's place state? Claims ownership when it has rows. */
  mayWrite(rows: number): boolean
}

export function createTurnPlaceOwner(on: boolean): TurnPlaceOwner {
  let owned = false
  return {
    mayWrite(rows) {
      if (!on) return true
      if (owned) return false
      if (rows > 0) owned = true
      return true
    },
  }
}

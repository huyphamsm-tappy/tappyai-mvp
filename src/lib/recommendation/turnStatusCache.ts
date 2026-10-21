import { placesViewKey } from './liveViewCache'
import type { TurnStatusAnnotation } from './progressAnnotation'

// ── C2 P2 layer 5 · the turn's end state, for as long as the tab lives ───────────────────────────────────────────────────────────────────────
//
// The `tappy.turn_status.v1` annotation (incomplete / interrupted) is never part of the answer text, so a saved message — `{role, content}`
// only — does not carry it. A completed turn is saved and `router.replace`d to `/chat/<id>`, where ChatInterface remounts from
// `savedMessages`, and the status line the user just saw would vanish a second later (the same measured hand-off as the place card,
// liveViewCache.ts). This keeps it across THAT navigation, and nothing more:
//
//   · a module-scoped Map in the tab's heap — no localStorage, no sessionStorage, no IndexedDB, no server write, nothing on disk;
//   · gone on reload, gone on tab close, never sent anywhere;
//   · bounded, so a long session cannot grow it without limit.
//
// Keyed like the place card (the message id changes across the save; the first characters of the text do not).

const MAX_ENTRIES = 20
const cache = new Map<string, TurnStatusAnnotation>()

export function rememberTurnStatus(content: string, status: TurnStatusAnnotation): void {
  const key = placesViewKey(content)
  if (!key) return
  cache.delete(key)
  cache.set(key, status)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function recallTurnStatus(content: string): TurnStatusAnnotation | null {
  return cache.get(placesViewKey(content)) ?? null
}

/** Test-only: the cache is module state, and a test must be able to start clean. */
export function __resetTurnStatusCache(): void {
  cache.clear()
}

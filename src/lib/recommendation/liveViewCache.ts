import type { PlacesLiveView } from './liveView'

// ── The decision, for as long as the tab lives ───────────────────────────────
//
// 🚨 WITHOUT THIS THE CARD FLICKERS AND VANISHES. Measured on localhost: the
// reply streams, the annotation arrives, the card renders — and roughly a second
// later `onSave` creates the conversation and `router.replace`s to `/chat/<id>`.
// That is a different route, so ChatInterface remounts from `savedMessages`,
// which are `{role, content}` only. The annotation is not part of a saved
// message, so the card the user just saw disappears.
//
// This is an in-memory hand-off across that client-side navigation, and it is
// deliberately NOT storage:
//
//   · a module-scoped Map in the tab's heap — no localStorage, no sessionStorage,
//     no IndexedDB, no server write, nothing on disk;
//   · gone on reload, gone on tab close, never sent anywhere;
//   · bounded, so a long session cannot grow it without limit.
//
// That distinction is the whole reason the durable `[TAPPY_PLACES]` marker is
// still off: Google Places terms forbid STORING Places content, and holding a
// value in the page's memory for the session it was fetched in is the ordinary
// caching every client does to render a response at all.

/** Small on purpose: a chat scrolls, and only recent turns are ever re-rendered. */
const MAX_ENTRIES = 20

const cache = new Map<string, PlacesLiveView>()

/**
 * The key a saved message can be found by.
 *
 * The message id changes across the save/restore round trip (the server assigns
 * its own), so identity has to come from the content the user actually reads.
 * A prefix is enough to be unique within one conversation and is stable: the
 * text is saved verbatim, and the markers the client strips are appended at the
 * END of the reply, never the beginning.
 */
export function placesViewKey(content: string): string {
  return (content || '').trim().slice(0, 160)
}

export function rememberPlacesView(content: string, view: PlacesLiveView): void {
  const key = placesViewKey(content)
  if (!key) return
  // Re-insert so the most recently used entry is last, then trim the oldest.
  cache.delete(key)
  cache.set(key, view)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function recallPlacesView(content: string): PlacesLiveView | null {
  return cache.get(placesViewKey(content)) ?? null
}

/** Test-only: the cache is module state, and a test must be able to start clean. */
export function __resetPlacesViewCache(): void {
  cache.clear()
}

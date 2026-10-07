// In-app Back: CHILD → Back → the ACTUAL PARENT, never "always Home".
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
// Phase 7 UAT found six destination pages whose Back control was a fixed link to
// `/` (currency, split-bill, boi, viet-content, recommendations, both group pages)
// and one clip route whose "did we come from inside the app?" test read
// `document.referrer` — a value the browser sets ONCE per document load and never
// updates on a client-side navigation, so a tab that opened on `/profile` and then
// client-navigated into a clip always concluded it had arrived from outside and
// pushed `/reviews`. Smart Tools → tool → Back landed on Home; Profile → post →
// Back landed on Explore.
//
// `Header` already had the right idea for the legal pages (`backFallbackHref`,
// see legalBackNavigation.test.tsx): pop history when there is something of ours
// to pop, otherwise go to the declared parent. Its test was `history.length <= 1`,
// which is wrong in the other direction — a fresh tab's `about:blank` already
// counts, so a shared link opened in a new tab measured 2 and `router.back()`
// walked out of the site. This module is that idea with an honest signal.
//
// ============================================================================
// THE SIGNAL: the app's own copy of this tab's history
// ============================================================================
// `NavHistoryTracker` (mounted once in the root layout) watches the App Router's
// pathname and keeps, in `sessionStorage`, the list of in-app entries this tab
// has walked through and which one is current:
//
//   a new pathname, not a pop      → forward entries are dropped, it is appended,
//                                    the index moves onto it        (a push)
//   a pop (a `popstate` fired)     → the index moves to the neighbour that carries
//                                    that pathname (back, or forward)
//   the same pathname again        → nothing (a reload, a hash change)
//   a pop onto an unknown pathname → the list starts over at that entry: it was
//                                    an entry the app never created
//
// `hasInAppHistory()` is then simply "is the index above 0". This is kept OUT of
// `history.state` on purpose: the App Router rewrites that object with its own
// keys on its own schedule, so a stamp written there was measured to vanish.
// `history.length` cannot tell a push that replaced forward entries from a
// replace, and `popstate` alone cannot tell how far back the person went — the
// list answers both.
//
// A `router.replace()` looks like a push here (+1). The one way that over-counts
// is a chain of replaces from the entry page, and no page reached that way
// carries an in-app Back (login → Home). Under-counting is the failure mode to
// avoid: it would send Back to the declared parent instead of the page the
// person was actually on.
//
// This is a transport read, not business state: it decides "back or fallback"
// and nothing else.

const STACK_KEY = 'tappy:nav-stack'
const MAX_ENTRIES = 100

interface NavStack {
  entries: string[]
  index: number
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storage(): Store | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function readStack(store: Store): NavStack | null {
  try {
    const raw = store.getItem(STACK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NavStack>
    if (!Array.isArray(parsed.entries) || typeof parsed.index !== 'number') return null
    if (parsed.index < 0 || parsed.index >= parsed.entries.length) return null
    return { entries: parsed.entries.filter((e): e is string => typeof e === 'string'), index: parsed.index }
  } catch {
    return null
  }
}

function writeStack(store: Store, stack: NavStack): void {
  // Keep the tail: only the entries behind the current one matter for Back.
  let { entries, index } = stack
  if (entries.length > MAX_ENTRIES) {
    const drop = entries.length - MAX_ENTRIES
    entries = entries.slice(drop)
    index = Math.max(0, index - drop)
  }
  try { store.setItem(STACK_KEY, JSON.stringify({ entries, index })) } catch { /* quota: Back degrades to the fallback */ }
}

/** How many history entries behind the current one belong to this app (this tab). */
export function inAppDepth(): number {
  const store = storage()
  if (!store) return 0
  return readStack(store)?.index ?? 0
}

/** True when `router.back()` lands on a page of ours. */
export function hasInAppHistory(): boolean {
  return inAppDepth() > 0
}

/**
 * Record a pathname the router has just settled on. `popped` is whether a
 * `popstate` event fired since the previous record — the tracker owns that flag.
 * Returns the resulting depth.
 */
export function recordNavigation(pathname: string, opts: { popped: boolean }): number {
  const store = storage()
  if (!store) return 0
  const current = readStack(store)

  let next: NavStack
  if (!current) {
    // The entry page of this tab.
    next = { entries: [pathname], index: 0 }
  } else if (current.entries[current.index] === pathname) {
    // A reload, a hash change, or a navigation that changed only the query.
    next = current
  } else if (opts.popped) {
    const { entries, index } = current
    if (entries[index - 1] === pathname) next = { entries, index: index - 1 }
    else if (entries[index + 1] === pathname) next = { entries, index: index + 1 }
    else {
      // Further than one step: find the nearest entry with this pathname.
      let found = -1
      for (let d = 2; d < entries.length && found < 0; d++) {
        if (entries[index - d] === pathname) found = index - d
        else if (entries[index + d] === pathname) found = index + d
      }
      // Unknown: the browser restored an entry the app never created.
      next = found >= 0 ? { entries, index: found } : { entries: [pathname], index: 0 }
    }
  } else {
    // A push (or a replace, which is counted the same — see the module note).
    const entries = [...current.entries.slice(0, current.index + 1), pathname]
    next = { entries, index: entries.length - 1 }
  }

  writeStack(store, next)
  return next.index
}

/**
 * The one Back decision every in-app Back control makes.
 *
 * Pops history when the previous entry is ours; otherwise `replace()`s the
 * declared parent so the dead-end entry is not left behind (an Android TWA
 * would otherwise close the app on the next Back).
 */
export function goBack(
  router: { back: () => void; replace: (href: string) => void },
  fallbackHref: string
): void {
  if (hasInAppHistory()) router.back()
  else router.replace(fallbackHref)
}

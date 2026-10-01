// ── Cinema «now showing» pages (owner 01/10, ca b) ─────────────────────────────────────────────────────────────────
// Merchant URL grammars belong in src/lib/ccp (architecture rule no-commerce-merchant-hosts-outside-ccp). These are the
// cinema chains' OWN film-list pages: a plain link, no tracking, no price, no showtime. Opened and answered 200 on 2026-10-01.
// Consumed by src/lib/links/movieTitles.ts, which only words the reply around them.

export interface NowShowingPage { name: string; url: string }

// ONLY chains that are CCP registry providers may be linked (ccpBoundary: every merchant host must belong to a registry
// allow-list; the provider list is FROZEN, owner decision D10). Today that is CGV. Galaxy, Lotte, BHD and Beta have official
// «now showing» pages (opened 200 on 2026-10-01) but are NOT providers: adding them is an owner decision (PL-MOVIES).
export const CINEMA_NOW_SHOWING_PAGES: ReadonlyArray<NowShowingPage> = [
  { name: 'CGV', url: 'https://www.cgv.vn/default/movies/now-showing.html' },
]

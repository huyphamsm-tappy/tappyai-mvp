// ── Cinema «now showing» pages (owner 01/10, ca b) ─────────────────────────────────────────────────────────────────
// Merchant URL grammars belong in src/lib/ccp (architecture rule no-commerce-merchant-hosts-outside-ccp). These are the
// cinema chains' OWN film-list pages: a plain link, no tracking, no price, no showtime. Opened and answered 200 on 2026-10-01.
// Consumed by src/lib/links/movieTitles.ts, which only words the reply around them.

export interface NowShowingPage { name: string; url: string }

// ONLY chains that are CCP registry providers may be linked (ccpBoundary: every merchant host belongs to a registry
// allow-list). CGV is an adapter provider; Galaxy, Lotte, BHD and Beta joined as passthrough providers by owner decision
// 01/10/2026 (their pages opened without login: 200, BHD in a real browser — it answers a bare HTTP client 403).
export const CINEMA_NOW_SHOWING_PAGES: ReadonlyArray<NowShowingPage> = [
  { name: 'CGV', url: 'https://www.cgv.vn/default/movies/now-showing.html' },
  { name: 'Galaxy Cinema', url: 'https://www.galaxycine.vn/phim-dang-chieu/' },
  { name: 'Lotte Cinema', url: 'https://www.lottecinemavn.com/LCHS/Contents/Movie/Movie-List.aspx' },
  { name: 'BHD Star', url: 'https://www.bhdstar.vn/phim/' },
  { name: 'Beta Cinemas', url: 'https://www.betacinemas.vn/phim.htm' },
]

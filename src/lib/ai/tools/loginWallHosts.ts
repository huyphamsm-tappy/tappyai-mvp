// ── CONSULTATIVE_IN_AGENT — a link that needs a login is not offered ─────────────────────────────────────────────────────────────────
//
// Checked 2026-10-11 in a browser with no session: shopee.vn search pages, list pages AND product pages (…-i.<shop>.<item>) all end on a
// "Login Required" page. A product card whose "Xem" button opens that page is a dead end for a user who is not logged in to Shopee, and the row
// carries no price anyway ("chưa rõ giá"). With the flag on, product rows whose link is on such a host are dropped BEFORE ranking, so neither the
// card, the shortlist nor the prose can name them. Hosts are added here only after being opened logged-out; a host is never dropped on a guess.

export const LOGIN_WALL_HOSTS: readonly RegExp[] = [/(?:^|\.)shopee\.(?:vn|com|sg|co\.id|co\.th|com\.my|ph|tw)$/i]

export const isLoginWallUrl = (url: unknown): boolean => {
  if (typeof url !== 'string') return false
  try { const h = new URL(url).hostname; return LOGIN_WALL_HOSTS.some(re => re.test(h)) } catch { return false }
}

/**
 * The result without the rows of `result[listKey]` whose `link` / `url` is on a login-wall host. A COPY (the tools memoise their result object and
 * a turn without the flag may read the same one), `count` kept in step. Unchanged object when nothing was dropped.
 */
export function dropLoginWallRows<T>(result: T, listKey: 'results' | 'search_results' = 'results'): T {
  const r = result as unknown as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !Array.isArray(r[listKey])) return result
  const rows = r[listKey] as unknown[]
  const kept = rows.filter(row => !(row && typeof row === 'object' && (isLoginWallUrl((row as { link?: unknown }).link) || isLoginWallUrl((row as { url?: unknown }).url))))
  if (kept.length !== rows.length) {
    console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'login_wall_rows', listKey, dropped: rows.length - kept.length, kept: kept.length }))
    return { ...r, [listKey]: kept, ...(typeof r.count === 'number' ? { count: kept.length } : {}) } as unknown as T
  }
  return result
}

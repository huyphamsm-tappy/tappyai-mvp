/**
 * 🚨 OVERPASS REPORTS ITS OWN TIMEOUT AS A SUCCESSFUL EMPTY ANSWER.
 *
 * A query that exceeds the server's `[timeout:N]` comes back HTTP 200, with
 * `elements: []` and the reason in a `remark` string:
 *
 *   {"version":0.6, "elements":[],
 *    "remark":"runtime error: Query timed out in \"query\" at line 1 after 14 seconds."}
 *
 * Read as JSON and nothing more, that is indistinguishable from "there are no
 * restaurants here". It travelled downstream as `place_search_status: 'empty'`,
 * so the reply told the user District 1 has no restaurants — measured
 * 2026-09-08 on every GPS-biased query in HCMC.
 *
 * This is the same trap the endpoint list records for overpass.kumi.systems (an
 * HTML error page served as HTTP 200), reached by a different route: a 200 is
 * not a result, and only the body says which one it is.
 */

/** An Overpass payload, or null when the server reported a failure inside a 200. */
export function usableOverpass(data: unknown): { elements?: unknown[] } | null {
  if (!data || typeof data !== 'object') return null
  const remark = (data as { remark?: unknown }).remark
  // Overpass words its failures as "runtime error: Query timed out ..." and
  // "runtime error: Query run out of memory ...". Both are failures; a genuinely
  // empty area carries no remark at all.
  if (typeof remark === 'string' && /timed out|runtime error/i.test(remark)) return null
  return data as { elements?: unknown[] }
}

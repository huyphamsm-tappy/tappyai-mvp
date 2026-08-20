/**
 * The query string of a request, read from whichever standard property carries it.
 *
 * ============================================================================
 * WHY THIS EXISTS — R01
 * ============================================================================
 * Route handlers used to read `req.nextUrl.searchParams` directly. `nextUrl` is a Next.js
 * addition to the standard `Request`; under the real runtime it is always present, so this looked
 * correct and behaved correctly for years.
 *
 * The bill arrived at integration time. Module 08's suspension-enforcement tests build their
 * request with `new Request(...)` — a plain WHATWG Request, which has `url` and no `nextUrl` —
 * and exercise `POST /api/reviews`. On main that POST never touched `nextUrl`, so they passed.
 * The Consultative branch added a `?lang=` read to the same POST for the author-facing safety
 * notice. Neither side was wrong alone; the MERGE threw
 * `TypeError: Cannot read properties of undefined (reading 'searchParams')` and three security
 * tests went red. A green branch and a green main produced a red merge.
 *
 * ============================================================================
 * WHY IT READS BOTH, AND WHY THAT IS NOT A SHIM
 * ============================================================================
 * 🚨 The first attempt at this fix read ONLY `req.url` — and broke thirty tests, because this
 * repository already had a second, older mock convention: `{ nextUrl: new URL(…), headers, json }`
 * with no `url` at all. So one shape carries the URL in `nextUrl`, the other in `url`, and a
 * helper that insists on either one breaks half the suite. Rewriting whichever half lost would
 * have been changing tests to suit the fix rather than fixing the code.
 *
 * In the real runtime a route handler receives a `NextRequest`, where BOTH are present and
 * `nextUrl` is parsed from `url` — so the two branches below cannot disagree in production, and
 * this does not detect a test, branch on environment, or soften anything. It asks for the URL and
 * accepts either standard place a Request keeps it. A handler that only requires what it actually
 * uses is testable by anyone holding a Request, which is the real repair.
 *
 * The three `req.nextUrl.host` reads in the Zalo auth routes are deliberately untouched: they want
 * the host, already fall back through `x-forwarded-host`/`host` headers first, and answer a
 * different question from "what did the caller put in the query string".
 */
interface UrlBearingRequest {
  readonly url?: string
  readonly nextUrl?: { readonly searchParams: URLSearchParams }
}

/**
 * Returns EMPTY params rather than throwing when a request carries no usable URL.
 *
 * A query string is an optional input everywhere it is read here — every call site already treats
 * a missing parameter as "not supplied" and has a default. Throwing would convert an absent
 * optional into a 500, which is precisely the failure R01 was.
 */
export function requestSearchParams(req: UrlBearingRequest): URLSearchParams {
  if (req?.nextUrl?.searchParams) return req.nextUrl.searchParams
  if (typeof req?.url === 'string') {
    try {
      return new URL(req.url).searchParams
    } catch {
      // A relative or malformed URL. Same answer as no query string at all.
    }
  }
  return new URLSearchParams()
}

/**
 * One query parameter, or null.
 *
 * Convenience for the overwhelmingly common single-parameter read, so a call site does not have
 * to name the intermediate object just to ask one question.
 */
export function searchParam(req: UrlBearingRequest, name: string): string | null {
  return requestSearchParams(req).get(name)
}

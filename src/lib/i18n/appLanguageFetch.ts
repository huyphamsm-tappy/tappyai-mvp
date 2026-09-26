'use client'

import { appLocale } from './useTranslation'

/**
 * Sends `Accept-Language: <the language TappyAI is speaking to this user>` on every request this
 * app makes to its own API.
 *
 * ============================================================================
 * WHAT WAS WRONG (C29)
 * ============================================================================
 * The server has localized every user-facing message for a while, and it reads the language from
 * `?lang=` then `Accept-Language` (`requestLocale`). The web client never told it either. A browser
 * `fetch()` sends the BROWSER's `Accept-Language`, which comes from OS/browser settings and has
 * nothing to do with the language picked inside TappyAI.
 *
 * Measured before this file existed, one browser, one moment:
 *
 *     app language chosen in TappyAI : "vi"
 *     browser sends                  : en-US
 *     POST /api/reviews/<id>/like    → "Sign in to post, comment and follow."   ← English
 *     same call + Accept-Language:vi → "Hãy đăng nhập để đăng bài, bình luận…"  ← Vietnamese
 *
 * Both directions were wrong: a Vietnamese-browser user who picks English got Vietnamese messages,
 * and vice versa.
 *
 * ============================================================================
 * WHY AN INTERCEPTOR AND NOT 110 CALL SITES
 * ============================================================================
 * There are 115 `fetch('/api/…')` call sites in this app. Five of them passed `?lang=`. Threading a
 * header through the other 110 would fix today's bugs and guarantee tomorrow's: the 116th call site
 * would forget, silently, and nothing would fail.
 *
 * 🔑 Android already solved this exact problem the exact same way — `AppLanguageInterceptor` in
 * core:network attaches the header at the transport boundary, and its own comment records that
 * Android used to have this bug. This is that interceptor, for the web.
 *
 * ============================================================================
 * WHAT IT DELIBERATELY DOES NOT TOUCH
 * ============================================================================
 * - **Cross-origin requests.** Supabase, Google, storage buckets and every third party keep the
 *   browser's own header. Sending our UI language to someone else's API is not ours to do, and on a
 *   CORS preflight an extra header can turn a working request into a failing one.
 * - **A caller that set the header itself.** An explicit `Accept-Language` always wins, so a call
 *   that deliberately asks for a specific language — and the tests that do — keep working.
 * - **The value of `?lang=`.** `requestLocale` prefers the query parameter, so the five call sites
 *   that pass it are unaffected.
 *
 * The locale is read at CALL time, never captured at install time: the user can change language
 * mid-session and the very next request must carry the new value.
 */

const INSTALLED = Symbol.for('tappy.appLanguageFetch.installed')

/** Same-origin `/api/**` only — see the note above about third parties. */
function isOwnApi(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.href)
    return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

/**
 * The language to send: `appLocale()` — the explicit choice, else the product default.
 *
 * 🚨 It used to send NOTHING when the user had never chosen, on the reasoning that the browser's
 * own header was then the honest answer "and it is also what seeds the UI, so header and UI still
 * agree". That premise is gone: the UI now settles on the product default rather than on
 * `navigator.language`, so silence meant a visitor on an en-US browser READ Vietnamese and was
 * ANSWERED in English.
 *
 * That is not only a wording mismatch any more. `/api/chat` resolves the AI's reply language from
 * this header (ADR-027) whenever the message text does not settle it by itself — which is exactly
 * what diacritic-free Vietnamese does not do. So a fresh visitor typing "Tim quan bun bo ngon o
 * TPHCM" in a Vietnamese-looking app would have got an English answer, the very defect ADR-027
 * exists to remove.
 */
function chosenLanguage(): string {
  return appLocale()
}

/** Reads the request URL out of whatever shape the caller used. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Installs the interceptor. Idempotent — a second call is a no-op, so React StrictMode, a remount
 * or a hot reload cannot stack wrappers on top of each other.
 */
export function installAppLanguageFetch(): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & { [INSTALLED]?: boolean }
  if (w[INSTALLED]) return
  w[INSTALLED] = true

  const original = window.fetch.bind(window)

  window.fetch = function appLanguageFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (!isOwnApi(urlOf(input))) return original(input, init)

    const language = chosenLanguage()

    // A Request object carries its own headers, so it has to be rebuilt rather than decorated —
    // `init.headers` is ignored by fetch when the first argument is already a Request.
    if (input instanceof Request) {
      if (input.headers.has('Accept-Language')) return original(input, init)
      const headers = new Headers(input.headers)
      headers.set('Accept-Language', language)
      return original(new Request(input, { headers }), init)
    }

    const headers = new Headers(init?.headers)
    if (headers.has('Accept-Language')) return original(input, init)
    headers.set('Accept-Language', language)
    return original(input, { ...init, headers })
  }
}

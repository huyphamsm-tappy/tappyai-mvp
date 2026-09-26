import { normalizeLocale, type RequestLocale } from '@/lib/i18n/requestLocale'

// Which side of the public / app boundary the current document is on, as the client i18n store
// sees it. `src/app/(app)/layout.tsx` server-renders one hidden element carrying this attribute;
// no public route renders it. Reading the DOM (not the pathname) is what keeps this free of any
// route list: a page is "app" only because it sits under the (app) layout.
export const APP_SURFACE_ATTR = 'data-tappy-app-surface'

export function isAppSurface(): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector(`[${APP_SURFACE_ATTR}]`) !== null
}

/**
 * The visitor's language as their browser states it — the same preference list the browser turns
 * into `Accept-Language`, normalised the same way the server does it (`requestLocale`), so a public
 * page rendered on the client agrees with one rendered on the server (e.g. /plan/<id>).
 */
export function browserLocale(): RequestLocale {
  if (typeof navigator === 'undefined') return normalizeLocale(null)
  const first = Array.isArray(navigator.languages) && navigator.languages.length > 0 ? navigator.languages[0] : navigator.language
  return normalizeLocale(first)
}

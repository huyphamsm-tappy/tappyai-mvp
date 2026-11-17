/**
 * A search result's page, not Google's wrapper around it (measured 31/10: sources shown as "google.com" / "translate.google.com"): a redirect
 * (`google.com/url?q=` / `url=`), a translate proxy (`translate.google.com/translate?u=`, `<host-with-dashes>.translate.goog`) becomes the page
 * it points to; any other Google page (a search page) is not a source (null). Only https results are sources. Pure.
 * (Moved here from research/deepResearch.ts on 18/11 so the one-brain web_search can use it too: UAT case 39 cited "[NASA](https://translate.google.com/translate?u=)".)
 */
export function canonicalSourceUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (host.endsWith('.translate.goog')) {
    // Google's scheme: "-" stands for "." and "--" for "-" in the original host; the _x_tr_* parameters are the proxy's own
    const original = host.slice(0, -'.translate.goog'.length).split('--').map(p => p.replace(/-/g, '.')).join('-')
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('_x_tr_')) u.searchParams.delete(k)
    return canonicalSourceUrl(`https://${original}${u.pathname}${u.search}${u.hash}`)
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    // 31/10: a google.com/goto token the search layer could not resolve (Google's bot check) - kept: it opens the page in a browser, and its
    // snippet is evidence; the site it names comes with the row (Evidence.site)
    if (u.protocol === 'https:' && u.pathname === '/goto' && u.searchParams.has('url')) return u.toString()
    const inner = u.pathname === '/url' ? u.searchParams.get('q') ?? u.searchParams.get('url') : host.startsWith('translate.') ? u.searchParams.get('u') : null
    return inner && inner !== raw ? canonicalSourceUrl(inner) : null
  }
  return u.protocol === 'https:' ? u.toString() : null
}

/** True for a link that is a translate proxy (never a source in itself). */
export function isTranslateProxy(raw: string): boolean {
  try {
    const h = new URL(raw).hostname.toLowerCase()
    return h === 'translate.google.com' || h.endsWith('.translate.goog')
  } catch { return false }
}

/**
 * A search row's link with a translate proxy unwrapped to the page it points to; null when the proxy names no page (a link with an empty `u=`),
 * which makes the row no source at all. Any other link is returned as it is. Pure.
 */
export function unwrapProxyLink(raw: string): string | null {
  return isTranslateProxy(raw) ? canonicalSourceUrl(raw) : raw
}

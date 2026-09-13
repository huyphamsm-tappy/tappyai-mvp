// ── Parameter echo — the wrapper must hand back the destination it was given ─
// Owner decision D4: a tracking wrapper is accepted ONLY if the destination it
// encodes is the direct URL, parameter for parameter. This is what caught the
// ACCESSTRADE Product Link tool replacing a Trip.com hotel-detail URL with a
// preset homepage link; the Deep Link endpoint passes.
//
// Comparison is done on a NORMALISED form (scheme/host lower-cased, default
// port dropped, query sorted, trailing slash ignored) so an encoder that
// reorders parameters is not a false rejection, while any missing or changed
// parameter is.

export interface ParamEchoResult {
  ok: boolean
  missing: string[]
  changed: string[]
  extra: string[]
  hostMismatch: boolean
  pathMismatch: boolean
}

function normalise(u: URL): { host: string; path: string; params: Map<string, string> } {
  const params = new Map<string, string>()
  for (const [k, v] of u.searchParams.entries()) params.set(k, v)
  return {
    host: u.hostname.toLowerCase(),
    path: u.pathname.replace(/\/+$/, '') || '/',
    params,
  }
}

/** Compare the direct URL with the destination decoded from a wrapper. */
export function compareDestinations(direct: string, decoded: string): ParamEchoResult {
  let a: URL, b: URL
  try {
    a = new URL(direct)
    b = new URL(decoded)
  } catch {
    return { ok: false, missing: [], changed: [], extra: [], hostMismatch: true, pathMismatch: true }
  }
  const na = normalise(a)
  const nb = normalise(b)
  const missing: string[] = []
  const changed: string[] = []
  const extra: string[] = []
  for (const [k, v] of na.params) {
    if (!nb.params.has(k)) missing.push(k)
    else if (nb.params.get(k) !== v) changed.push(k)
  }
  for (const k of nb.params.keys()) if (!na.params.has(k)) extra.push(k)
  const hostMismatch = na.host !== nb.host
  const pathMismatch = na.path !== nb.path
  return { ok: !hostMismatch && !pathMismatch && missing.length === 0 && changed.length === 0, missing, changed, extra, hostMismatch, pathMismatch }
}

/**
 * Extract the destination a wrapper encodes. Supports the ACCESSTRADE
 * `?url=` form (percent-encoded) and the `url_enc=` form (base64, as emitted by
 * the portal's Product Link tool). Returns null when no destination is found —
 * which the resolver treats as a rejected wrapper, never as "probably fine".
 */
export function decodeWrapperDestination(wrapperUrl: string): string | null {
  let u: URL
  try {
    u = new URL(wrapperUrl)
  } catch {
    return null
  }
  const direct = u.searchParams.get('url')
  if (direct) return direct
  const enc = u.searchParams.get('url_enc')
  if (enc) {
    try {
      const b64 = enc.replace(/-/g, '+').replace(/_/g, '/')
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
      const text = Buffer.from(b64 + pad, 'base64').toString('utf8')
      return /^https?:\/\//i.test(text) ? text : null
    } catch {
      return null
    }
  }
  return null
}

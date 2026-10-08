// Phase 8 M3 — reading a PUBLIC web page for the agent runtime (TAPPY_AGENT=2 `read_page`), safely.
//
// Builds on safeFetch.ts (one pinned DNS resolution per hop; the socket connects to the address that was validated; TLS still verifies
// the NAME). Adds what reading arbitrary public pages needs, without a domain allow-list:
//
//   · every hop (the first URL and every redirect) re-validated as a STRING before any socket: http/https only, no credentials, default
//     ports only (80/443 — no probing of internal services on odd ports), no localhost / *.local / *.internal / *.localhost names, and an
//     IP-literal host checked against the address policy HERE — Node does not call the custom `lookup` for a literal IP, so the pinned
//     resolver alone would never see `https://169.254.169.254/` (a gap also present in safeGetText's redirect hops; reported, not changed);
//   · DNS: the pinned resolver refuses if ANY returned address is private / loopback / link-local / metadata / multicast (rebinding-safe);
//   · redirects: at most `maxRedirects`, each hop validated as above; a redirect to http from https is allowed only to a public host;
//   · timeouts: connect, idle read, and a total deadline; the caller's signal aborts everything;
//   · content type must be text-like (html / xhtml / plain / json / xml); anything else is refused before the body is read;
//   · body capped at `maxBytes` (truncated, flagged); `Accept-Encoding: identity` — no decompression bombs;
//   · never throws: every failure is a typed result with a reason (no address in any message).

import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import { isAllowedDestinationAddress } from './addressPolicy'
import { safeLookup } from './safeFetch'

export type PageFailure =
  | 'invalid_url' | 'blocked_scheme' | 'blocked_credentials' | 'blocked_port' | 'blocked_host' | 'blocked_address'
  | 'too_many_redirects' | 'redirect_without_location' | 'http_error' | 'unsupported_content_type' | 'unsupported_encoding'
  | 'connect_timeout' | 'read_timeout' | 'total_timeout' | 'aborted' | 'network_error'

export type PageFetchResult =
  | { ok: true; url: string; finalUrl: string; status: number; contentType: string; body: string; bytes: number; truncated: boolean; redirects: number; ms: number }
  | { ok: false; url: string; reason: PageFailure; status?: number; redirects: number; ms: number }

export interface PageFetchOptions {
  maxBytes?: number
  maxRedirects?: number
  connectTimeoutMs?: number
  readTimeoutMs?: number
  totalTimeoutMs?: number
  allowHttp?: boolean
  signal?: AbortSignal
}

export const PAGE_FETCH_DEFAULTS = { maxBytes: 800_000, maxRedirects: 4, connectTimeoutMs: 3_000, readTimeoutMs: 5_000, totalTimeoutMs: 8_000, allowHttp: true } as const

const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/json|application\/ld\+json|text\/xml|application\/xml)\b/i

/** The string-level check of ONE hop. null = allowed; otherwise why not. Pure. */
export function validateHop(raw: string, o: { allowHttp: boolean } = { allowHttp: true }): { url: URL } | { reason: PageFailure } {
  let u: URL
  try { u = new URL(raw) } catch { return { reason: 'invalid_url' } }
  if (u.protocol !== 'https:' && !(o.allowHttp && u.protocol === 'http:')) return { reason: 'blocked_scheme' }
  if (u.username || u.password) return { reason: 'blocked_credentials' }
  if (u.port && !((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80'))) return { reason: 'blocked_port' }
  let h = u.hostname.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa') || !h.includes('.') && !h.includes(':')) return { reason: 'blocked_host' }
  // An IP literal never reaches the pinned resolver (Node connects to it directly): judge it here.
  const literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || /^\d+$/.test(h) || /^0x/i.test(h)
  if (literal && !isAllowedDestinationAddress(h)) return { reason: 'blocked_address' }
  return { url: u }
}

/** One hop's raw outcome (transport level). Exported for tests that drive the hop loop without sockets. */
export type HopResult =
  | { kind: 'redirect'; status: number; location: string | null }
  | { kind: 'body'; status: number; contentType: string; body: string; bytes: number; truncated: boolean }
  | { kind: 'error'; reason: PageFailure; status?: number }

export type HopTransport = (url: URL, o: { signal: AbortSignal; maxBytes: number; connectTimeoutMs: number; readTimeoutMs: number }) => Promise<HopResult>

/** The real transport: one request through the pinned resolver, no agent reuse, identity encoding, typed failures. */
export const realHop: HopTransport = (url, o) => new Promise<HopResult>(resolve => {
  let settled = false
  const done = (r: HopResult) => { if (!settled) { settled = true; clearTimeout(connectTimer); resolve(r) } }
  const lib = url.protocol === 'http:' ? http : https
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  let req: http.ClientRequest
  try {
    req = lib.request({
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port ? Number(url.port) : url.protocol === 'http:' ? 80 : 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TappyAI/1.0; +https://tappyai.com)', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.1', 'Accept-Encoding': 'identity', 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8', Host: url.host },
      ...(url.protocol === 'https:' ? { servername: url.hostname } : {}),
      lookup: safeLookup,
      agent: false,
      signal: o.signal,
    }, (res: IncomingMessage) => {
      clearTimeout(connectTimer)
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) { res.resume(); return done({ kind: 'redirect', status, location: (res.headers.location as string | undefined) ?? null }) }
      if (status < 200 || status >= 300) { res.resume(); return done({ kind: 'error', reason: 'http_error', status }) }
      const contentType = String(res.headers['content-type'] ?? '')
      if (!TEXT_TYPES.test(contentType.trim())) { res.destroy(); return done({ kind: 'error', reason: 'unsupported_content_type', status }) }
      // We ask for identity; a server that compresses anyway is refused (decompressing would bypass the byte cap — measured: binary
      // bodies labelled text/html reached the extractor).
      const enc = String(res.headers['content-encoding'] ?? '').trim().toLowerCase()
      if (enc && enc !== 'identity') { res.destroy(); return done({ kind: 'error', reason: 'unsupported_encoding', status }) }
      res.setTimeout(o.readTimeoutMs, () => { res.destroy(); done({ kind: 'error', reason: 'read_timeout', status }) })
      const chunks: Buffer[] = []
      let bytes = 0
      res.on('data', (c: Buffer) => {
        bytes += c.length
        if (bytes > o.maxBytes) { chunks.push(c.subarray(0, Math.max(0, c.length - (bytes - o.maxBytes)))); res.destroy(); return done({ kind: 'body', status, contentType, body: Buffer.concat(chunks).toString('utf8'), bytes: o.maxBytes, truncated: true }) }
        chunks.push(c)
      })
      res.on('end', () => done({ kind: 'body', status, contentType, body: Buffer.concat(chunks).toString('utf8'), bytes, truncated: false }))
      res.on('error', () => done({ kind: 'error', reason: o.signal.aborted ? 'aborted' : 'network_error', status }))
    })
  } catch { return done({ kind: 'error', reason: 'network_error' }) }
  connectTimer = setTimeout(() => { req.destroy(); done({ kind: 'error', reason: 'connect_timeout' }) }, o.connectTimeoutMs)
  req.on('error', (e: NodeJS.ErrnoException) => done({ kind: 'error', reason: o.signal.aborted ? 'aborted' : e?.name === 'BlockedDestinationError' || /not allowed/i.test(e?.message ?? '') ? 'blocked_address' : 'network_error' }))
  req.end()
})

let override: ((url: string, o: PageFetchOptions) => Promise<PageFetchResult>) | null = null
/** Eval / replay seam: replace the whole fetch (the harness records and replays pages). null restores the real one. */
export function __setPageFetchOverride(fn: typeof override): void { override = fn }

/** Reads one public page. Never throws. `transport` is a test seam for the hop loop. */
export async function fetchPublicPage(rawUrl: string, opts: PageFetchOptions = {}, transport: HopTransport = realHop): Promise<PageFetchResult> {
  if (override && transport === realHop) return override(rawUrl, opts)
  return fetchPublicPageReal(rawUrl, opts, transport)
}

/** The real implementation (what the eval override delegates to on a recording miss). */
export async function fetchPublicPageReal(rawUrl: string, opts: PageFetchOptions = {}, transport: HopTransport = realHop): Promise<PageFetchResult> {
  const o = { ...PAGE_FETCH_DEFAULTS, ...opts }
  const t0 = Date.now()
  const ctrl = new AbortController()
  const onOuter = () => ctrl.abort()
  o.signal?.addEventListener('abort', onOuter, { once: true })
  if (o.signal?.aborted) ctrl.abort()
  let totalTimedOut = false
  const total = setTimeout(() => { totalTimedOut = true; ctrl.abort() }, o.totalTimeoutMs)
  let redirects = 0
  let current = rawUrl
  try {
    for (;;) {
      if (ctrl.signal.aborted) return { ok: false, url: rawUrl, reason: totalTimedOut ? 'total_timeout' : 'aborted', redirects, ms: Date.now() - t0 }
      const v = validateHop(current, { allowHttp: o.allowHttp })
      if ('reason' in v) return { ok: false, url: rawUrl, reason: v.reason, redirects, ms: Date.now() - t0 }
      const hop = await transport(v.url, { signal: ctrl.signal, maxBytes: o.maxBytes, connectTimeoutMs: o.connectTimeoutMs, readTimeoutMs: o.readTimeoutMs })
      if (hop.kind === 'error') return { ok: false, url: rawUrl, reason: totalTimedOut ? 'total_timeout' : hop.reason, ...(hop.status ? { status: hop.status } : {}), redirects, ms: Date.now() - t0 }
      if (hop.kind === 'redirect') {
        if (!hop.location) return { ok: false, url: rawUrl, reason: 'redirect_without_location', status: hop.status, redirects, ms: Date.now() - t0 }
        if (++redirects > o.maxRedirects) return { ok: false, url: rawUrl, reason: 'too_many_redirects', redirects, ms: Date.now() - t0 }
        try { current = new URL(hop.location, v.url).toString() } catch { return { ok: false, url: rawUrl, reason: 'invalid_url', redirects, ms: Date.now() - t0 } }
        continue
      }
      return { ok: true, url: rawUrl, finalUrl: v.url.toString(), status: hop.status, contentType: hop.contentType, body: hop.body, bytes: hop.bytes, truncated: hop.truncated, redirects, ms: Date.now() - t0 }
    }
  } finally {
    clearTimeout(total)
    o.signal?.removeEventListener('abort', onOuter)
  }
}

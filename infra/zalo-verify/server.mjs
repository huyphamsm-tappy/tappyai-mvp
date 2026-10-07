// zalo-verify -- resolves a Zalo access token to a Zalo user id, from a Vietnamese address.
//
// WHY THIS EXISTS: graph.zalo.me/v2.0/me answers -501 ("region restricted") to every
// non-Vietnamese address we measured on 2026-09-24 (Vercel iad1, Cloud Run us-central1 and
// asia-southeast1). The web app must learn the user id SERVER-SIDE (R-1: never trust an id the
// browser sends), so it asks this service, which runs on a VPS in Vietnam behind Caddy.
//
// CONTRACT (the app side is createProxyZaloVerifier in src/lib/zalo/identity.ts):
//   POST /verify   header x-zalo-verify-secret: <shared secret>   body {"at":"<access token>"}
//                  body may add "profile": true to also get the display name and avatar
//     200 {"id":"<digits>"}                  Zalo returned the user id
//     200 {"id","name","avatar"}             ... with "profile": true
//     200 {"error":"invalid_token"}          Zalo rejected the token (the app answers 401)
//     502 {"error":"region_restricted"}      Zalo -501: this box is not seen as Vietnamese
//     502 {"error":"upstream_error","code"}  any other Zalo answer, timeout or network error
//     400 {"error":"bad_request"}            malformed body
//     401 {"error":"unauthorized"}           missing / wrong secret (checked FIRST, constant-time)
//                                            ZALO_VERIFY_SECRET may list several secrets
//                                            (comma/space separated) so UAT and production can
//                                            each hold their own against one VPS
//     429 {"error":"rate_limited"}
//   GET  /healthz  200 {"ok":true}           no secret needed, reveals nothing
//
// RULES: the only outbound call is GET https://graph.zalo.me/v2.0/me?fields=id with the token in
// the access_token HEADER (never in a URL), 5s timeout. The token, the request body and the
// secret are never logged, echoed or stored. Zero dependencies: Node >= 20 only.

import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const SECRET_HEADER = 'x-zalo-verify-secret'
export const ZALO_ME_URL = 'https://graph.zalo.me/v2.0/me?fields=id'
// Login creates the account, so it also needs what to call the person. Same single call.
export const ZALO_ME_PROFILE_URL = 'https://graph.zalo.me/v2.0/me?fields=id,name,picture'
export const UPSTREAM_TIMEOUT_MS = 5000
export const MAX_BODY_BYTES = 4096
// Zalo codes that mean "this token is not valid" -- a verdict on the user, not an outage.
// 452 invalid session key, -124 / -216 access token invalid or expired.
export const INVALID_TOKEN_CODES = new Set([452, -124, -216])
const REGION_RESTRICTED = -501
const ZALO_ID = /^\d{6,32}$/
// A Zalo access token is printable ASCII without spaces; anything else is not one.
const TOKEN_SHAPE = /^[\x21-\x7e]{16,2048}$/

const digest = (s) => createHash('sha256').update(String(s), 'utf8').digest()

/**
 * Constant-time: both sides hashed to 32 bytes first, so a length difference leaks nothing.
 *
 * `expected` may hold SEVERAL secrets separated by commas or whitespace, so one VPS can serve
 * UAT and production with a different secret each (release checklist RULE 3). Every candidate is
 * compared — no early exit — so the time taken does not say which one matched.
 */
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  const candidates = expected.split(/[,\s]+/).filter((x) => x.length >= 32)
  if (candidates.length === 0) return false
  const g = digest(given)
  let ok = false
  for (const c of candidates) if (timingSafeEqual(g, digest(c))) ok = true
  return ok
}

/** Fixed-window counter per key. Small and in-memory: one process, one box. */
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10000 }) {
  const hits = new Map()
  return {
    allow(key) {
      const t = now()
      let e = hits.get(key)
      if (!e || t - e.start >= windowMs) {
        if (hits.size >= maxKeys) hits.clear()
        e = { start: t, count: 0 }
        hits.set(key, e)
      }
      e.count += 1
      return e.count <= limit
    },
  }
}

/** Ask Zalo. Returns the response this service should send. Never throws. */
export async function lookupZaloId(at, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS, wantProfile = false) {
  let body
  try {
    const res = await fetchImpl(wantProfile ? ZALO_ME_PROFILE_URL : ZALO_ME_URL, {
      method: 'GET',
      headers: { access_token: at },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    })
    body = await res.json()
  } catch {
    return { status: 502, body: { error: 'upstream_error', code: 'unreachable' } }
  }
  const code = typeof body?.error === 'number' ? body.error : null
  if (body && typeof body.id === 'string' && ZALO_ID.test(body.id) && !code) {
    if (!wantProfile) return { status: 200, body: { id: body.id } }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
    const url = body.picture?.data?.url
    const avatar = typeof url === 'string' && /^https:\/\//.test(url) ? url : null
    return { status: 200, body: { id: body.id, name, avatar } }
  }
  if (code === REGION_RESTRICTED) return { status: 502, body: { error: 'region_restricted' } }
  if (code !== null && INVALID_TOKEN_CODES.has(code)) return { status: 200, body: { error: 'invalid_token' } }
  return { status: 502, body: { error: 'upstream_error', code: code ?? 'no_id' } }
}

/**
 * The whole service as one function, so it can be tested without sockets.
 * req: { method, path, headers (lower-case keys), ip, body: string }
 */
export function createHandler({
  secret,
  fetchImpl = fetch,
  now = Date.now,
  perIpPerMinute = 60,
  globalPerMinute = 600,
  badSecretPerIpPerMinute = 10,
  blockMs = 15 * 60_000,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
}) {
  // One secret, or several separated by commas/whitespace; each must be at least 32 characters.
  if (typeof secret !== 'string' || !secret.split(/[,\s]+/).some((x) => x.length >= 32)) {
    throw new Error('ZALO_VERIFY_SECRET must hold at least one secret of 32+ characters')
  }
  const perIp = createRateLimiter({ limit: perIpPerMinute, windowMs: 60_000, now })
  const global = createRateLimiter({ limit: globalPerMinute, windowMs: 60_000, now })
  const badSecret = createRateLimiter({ limit: badSecretPerIpPerMinute, windowMs: 60_000, now })
  const blocked = new Map() // ip -> blocked-until, after too many wrong secrets

  return async function handle(req) {
    const ip = req.ip || 'unknown'
    if (req.method === 'GET' && req.path === '/healthz') return { status: 200, body: { ok: true } }
    if (req.path !== '/verify') return { status: 404, body: { error: 'not_found' } }
    if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } }

    const until = blocked.get(ip)
    if (until && until > now()) return { status: 429, body: { error: 'rate_limited' } }
    if (until) blocked.delete(ip)
    if (!global.allow('*') || !perIp.allow(ip)) return { status: 429, body: { error: 'rate_limited' } }

    // The secret before ANYTHING that looks at the token.
    if (!secretMatches(req.headers?.[SECRET_HEADER], secret)) {
      if (!badSecret.allow(ip)) {
        if (blocked.size > 10000) blocked.clear()
        blocked.set(ip, now() + blockMs)
      }
      return { status: 401, body: { error: 'unauthorized' } }
    }

    let at, wantProfile
    try {
      const parsed = JSON.parse(req.body)
      at = parsed?.at
      wantProfile = parsed?.profile === true
    } catch {
      return { status: 400, body: { error: 'bad_request' } }
    }
    if (typeof at !== 'string' || !TOKEN_SHAPE.test(at)) return { status: 400, body: { error: 'bad_request' } }
    return lookupZaloId(at, fetchImpl, timeoutMs, wantProfile)
  }
}

/** Socket wrapper. Binds to loopback only: Caddy on the same box is the sole way in. */
export function startServer({ secret, port = 8787, host = '127.0.0.1', log = console.log, handlerOpts = {} }) {
  const handle = createHandler({ secret, ...handlerOpts })
  const server = createServer((req, res) => {
    const started = Date.now()
    const path = (req.url || '/').split('?')[0]
    let sent = false
    const send = (status, body) => {
      if (sent) return
      sent = true
      const payload = JSON.stringify(body)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(payload),
      })
      res.end(payload)
      // Outcome only. Never the token, the body, the headers or the secret.
      const outcome = body.error ?? (body.id ? 'id' : 'ok')  // never the id itself, never a name
      const code = body.code !== undefined ? ` code=${body.code}` : ''
      log(`${req.method} ${path} ${status} ${outcome}${code} ${Date.now() - started}ms`)
    }
    // Caddy (on this box) sets X-Forwarded-For; we listen on loopback, so only Caddy can reach us.
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    const ip = xff || req.socket.remoteAddress || 'unknown'
    let size = 0
    let chunks = []
    req.on('data', (c) => {
      if (sent) return
      size += c.length
      if (size > MAX_BODY_BYTES) {
        chunks = []
        send(413, { error: 'too_large' })
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', async () => {
      if (sent) return
      const body = Buffer.concat(chunks).toString('utf8')
      chunks = []
      try {
        const r = await handle({ method: req.method, path, headers: req.headers, ip, body })
        send(r.status, r.body)
      } catch {
        send(500, { error: 'internal' })
      }
    })
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5_000
  server.keepAliveTimeout = 5_000
  server.listen(port, host, () => log(`zalo-verify listening on ${host}:${server.address().port}`))
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.ZALO_VERIFY_SECRET
  if (!secret || secret.length < 32) {
    console.error('ZALO_VERIFY_SECRET missing or shorter than 32 characters; refusing to start')
    process.exit(1)
  }
  startServer({ secret, port: Number(process.env.PORT || 8787) })
}

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ACCESSTRADE_WRAPPER_HOSTS } from './wrapperHosts'

// ── Affiliate click links — owner decision 2026-09-29 (Phương án C) ─────────────────────────────────
//
// `sub1` is a NEW RANDOM value per click. It is not derived from the user id (unlike the old keyed
// HMAC) and never repeats between clicks, so the network cannot tell that two clicks came from the
// same person. Tappy keeps the join (sub1 → identity, time, provider, destination) server-side in
// `commerce_click_attributions` (RLS: server only) and reconciles conversions through it.
//
// The chat reply therefore never carries a sub1. A tracked link points at Tappy's own `/go/at`,
// carrying: the ACCESSTRADE deep link WITHOUT sub1 (`u`), the provider (`p`), the identity SEALED
// with AES-256-GCM (`a` — ciphertext, not an id), the old keyed hash only as a cache marker for this
// caller's links (`h`, never forwarded), and an HMAC over all of them (`s`) so nothing can be swapped.
// A click needs no cookie (Android opens links in the browser): the identity is in the sealed token.
// Nothing leaves for the partner except the deep link + the fresh sub1.
//
// Key material comes from `CCP_ATTRIBUTION_SECRET` (read here, like every affiliate credential —
// architecture rule no-affiliate-keys-outside-ccp-tracking), domain-separated per use.

export const CLICK_PATH = '/go/at'
const SUB1_RE = /^[0-9a-f]{24}$/
const ID_SHAPE = /^[A-Za-z0-9-]{8,128}$/

function secret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const s = env.CCP_ATTRIBUTION_SECRET?.trim()
  return s && s.length >= 32 ? s : undefined
}
const key = (s: string, use: string) => createHash('sha256').update(`${use}:${s}`).digest()

/** The identity, sealed for the click link. Undefined without a secret or a well-formed id. */
export function sealIdentity(identityId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const s = secret(env)
  if (!s || !identityId || !ID_SHAPE.test(identityId)) return undefined
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(s, 'ccp-seal'), iv)
  const body = Buffer.concat([c.update(identityId, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')
}

/** The identity inside a seal, or null when it was tampered with / made with another secret. */
export function openIdentity(seal: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const s = secret(env)
  if (!s || !seal || !/^[A-Za-z0-9_-]{40,400}$/.test(seal)) return null
  try {
    const raw = Buffer.from(seal, 'base64url')
    const d = createDecipheriv('aes-256-gcm', key(s, 'ccp-seal'), raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    const id = Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
    return ID_SHAPE.test(id) ? id : null
  } catch {
    return null
  }
}

const sign = (s: string, parts: string[]) => createHmac('sha256', key(s, 'ccp-go')).update(parts.join('\n')).digest('base64url').slice(0, 32)

function siteBase(env: NodeJS.ProcessEnv): string {
  const v = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')
  return v && /^https:\/\//.test(v) ? v : 'https://www.tappyai.com'
}

/** The link the reply carries for a tracked ACCESSTRADE deep link. Undefined → keep the deep link as is. */
export function buildClickUrl(input: { wrapperUrl: string; providerId: string; seal?: string; actorHash?: string }, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const s = secret(env)
  if (!s || !input.seal) return undefined
  const p = input.providerId.slice(0, 40)
  const h = input.actorHash && /^[a-f0-9]{16,64}$/.test(input.actorHash) ? input.actorHash : ''
  const q = new URLSearchParams({ u: input.wrapperUrl, p, a: input.seal, ...(h ? { h } : {}) })
  q.set('s', sign(s, [input.wrapperUrl, p, input.seal, h]))
  return `${siteBase(env)}${CLICK_PATH}?${q.toString()}`
}

export interface OpenedClick { wrapperUrl: string; providerId: string; identityId: string | null }

/** Verifies a click link. Null when unsigned, altered, or pointing anywhere but an ACCESSTRADE host. */
export function openClickUrl(params: URLSearchParams, env: NodeJS.ProcessEnv = process.env): OpenedClick | null {
  const s = secret(env)
  const u = params.get('u') ?? '', p = params.get('p') ?? '', a = params.get('a') ?? '', h = params.get('h') ?? '', sig = params.get('s') ?? ''
  if (!s || !u || !p || !a || !sig) return null
  const want = Buffer.from(sign(s, [u, p, a, h])), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  let host = ''
  try { const url = new URL(u); if (url.protocol !== 'https:') return null; host = url.host } catch { return null }
  if (!(ACCESSTRADE_WRAPPER_HOSTS as readonly string[]).includes(host)) return null
  if (new URL(u).searchParams.has('sub1')) return null
  return { wrapperUrl: u, providerId: p, identityId: openIdentity(a, env) }
}

/** 24 lowercase hex characters from a CSPRNG — a fresh sub1 for every click. */
export function newClickSub1(): string {
  const v = randomBytes(12).toString('hex')
  if (!SUB1_RE.test(v)) throw new Error('sub1 shape')
  return v
}

/** The ACCESSTRADE deep link with this click's sub1 appended. */
export function withSub1(wrapperUrl: string, sub1: string): string {
  const url = new URL(wrapperUrl)
  url.searchParams.set('sub1', sub1)
  return url.toString()
}

/** The cache marker of a click link (the old keyed hash), or the sub1 of a direct deep link, or null. */
export function linkActorMarker(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.pathname === CLICK_PATH) return url.searchParams.get('h')
    return url.searchParams.get('sub1')
  } catch {
    return null
  }
}

/** The ACCESSTRADE deep link a click link wraps (for analytics that classify links), else the href. */
export function unwrapClickUrl(href: string): string {
  try {
    const url = new URL(href)
    return url.pathname === CLICK_PATH ? url.searchParams.get('u') ?? href : href
  } catch {
    return href
  }
}

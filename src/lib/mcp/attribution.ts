// Attribution short links for the Gateway (connector doc §15, ADR-CONN-015, ADR-CONN-021): TappyAI-controlled links that record WHERE a recommendation came from (the Host channel, the tool, a
// recommendation reference), never WHO acted on it. A token is `base64url(payload).base64url(HMAC-SHA256)`; the payload has six fixed fields and NO person, account, installation or location, so the
// source of a click can never be mistaken for the identity of the buyer: whoever opens the link is resolved independently at checkout, and nothing here awards a reward for creating or sharing a link.
//
// Redirect safety: the destination is an https URL on an allowlisted host (exact or subdomain), checked when the link is BUILT and again when it is OPENED (an allowlist change reaches old links);
// the token is signed, bounded in time, and refuses any extra field. No secret, no link: with no configured secret nothing is built and the redirect route does not exist (404).
// ATTRIBUTION_HOSTS is a PLACEHOLDER list of travel/commerce hosts already named elsewhere in the product: the owner decides the real partner list. A short link does not guarantee a commission.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HOST_PLATFORMS, type HostPlatform } from './connectorContract'

type Env = Record<string, string | undefined>

export const ATTRIBUTION_HOSTS: readonly string[] = ['agoda.com', 'booking.com', 'traveloka.com', 'vexere.com', 'shopee.vn', 'tiki.vn', 'lazada.vn', 'google.com']
export const LINK_VALID_MS = 90 * 24 * 60 * 60 * 1000
const CHANNELS = HOST_PLATFORMS.map(h => `${h}_mcp` as const)
export type Channel = `${HostPlatform}_mcp`

/** The six fields of a token. By construction there is no field for a person. */
export interface LinkPayload { v: 1; ch: Channel; tool: string; ref: string; dest: string; iat: number }
const KEYS = ['ch', 'dest', 'iat', 'ref', 'tool', 'v']

export const channelOf = (host: HostPlatform): Channel => `${host}_mcp` as Channel

/** The normalised URL when it is https, has no credentials or custom port, and its host is (a subdomain of) an allowlisted host; otherwise null. Pure. */
export function destinationAllowed(url: unknown, hosts: readonly string[] = ATTRIBUTION_HOSTS): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
    const h = u.hostname.toLowerCase()
    return hosts.some(a => h === a || h.endsWith(`.${a}`)) ? u.href : null
  } catch { return null }
}

const mac = (body: string, secret: string): Buffer => createHmac('sha256', secret).update(body).digest()

export function signToken(p: LinkPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url')
  return `${body}.${mac(body, secret).toString('base64url')}`
}

/** The payload of a genuine, unexpired token whose fields are exactly the six and whose destination is still allowed; otherwise null. Never throws. */
export function verifyToken(token: unknown, secret: string, now: Date): LinkPayload | null {
  if (typeof token !== 'string' || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const given = Buffer.from(parts[1], 'base64url'); const want = mac(parts[0], secret)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>
    if (!p || typeof p !== 'object' || Object.keys(p).sort().join() !== KEYS.join()) return null
    if (p.v !== 1 || !(CHANNELS as readonly unknown[]).includes(p.ch) || typeof p.tool !== 'string' || typeof p.ref !== 'string' || typeof p.iat !== 'number') return null
    const t = now.getTime()
    if (p.iat * 1000 > t + 60_000 || t - p.iat * 1000 > LINK_VALID_MS) return null
    if (destinationAllowed(p.dest) === null) return null
    return p as unknown as LinkPayload
  } catch { return null }
}

/** `<base>/go/m/<token>` for an allowlisted destination, or null (no secret, no base, or a destination that is not allowed: the original URL then stays the only link). Pure. */
export function buildTrackedLink(o: { baseUrl: string; secret: string; host: HostPlatform; tool: string; ref: string; dest: string; now: Date }): string | null {
  const dest = destinationAllowed(o.dest)
  if (!o.secret || !o.baseUrl || !dest) return null
  return `${o.baseUrl}/go/m/${signToken({ v: 1, ch: channelOf(o.host), tool: o.tool, ref: o.ref, dest, iat: Math.floor(o.now.getTime() / 1000) }, o.secret)}`
}

/** Secret (at least 32 characters) and an https base derived from the resource URL; null otherwise. Presence/shape only: the value is never logged. */
export function attributionConfig(env: Env): { secret: string; baseUrl: string } | null {
  const secret = env.MCP_ATTRIBUTION_SECRET ?? ''
  const resource = env.MCP_RESOURCE_URL ?? ''
  if (secret.length < 32 || !resource.startsWith('https://')) return null
  try { return { secret, baseUrl: new URL(resource).origin } } catch { return null }
}

// Which OAuth clients are an AI Host Tappy knows, decided from WHERE THEY SEND THE USER BACK (their redirect URIs), because Hosts register themselves (dynamic client registration is on at
// Supabase) and an unknown client_id says nothing. A phishing app can call itself "Claude", but it cannot make claude.ai receive the code: the authorization code always goes to the redirect
// URI, so a client whose redirect URIs are all the real Host's own is the real Host (or cannot use the code anyway). A client with any other redirect URI is NOT approved: the consent screen
// denies it and the gateway refuses its token. Pure rules + an injected lookup (the real lookup is src/lib/auth/oauthClientDirectory.ts, which holds the only admin credential).
//
// 🚨 The DEFAULT rules below are the redirect URIs as best known on 23/11/2026 and are UNVERIFIED against a real registration of each Host. They are corrected from what each Host really registers
// (read the client list at Supabase after the first connection). MCP_REDIRECT_RULES (JSON) replaces the rules of a Host; MCP_OAUTH_CLIENTS still approves a client_id by hand.
import { HOST_PLATFORMS, type HostPlatform } from './connectorContract'

export interface HostRedirectRule { exact?: readonly string[]; prefix?: readonly string[] }
export type RedirectRules = Readonly<Partial<Record<HostPlatform, HostRedirectRule>>>

export const DEFAULT_REDIRECT_RULES: RedirectRules = Object.freeze({
  claude: { exact: ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'] },
  // SEEN ON A REAL REGISTRATION (23/11/2026): ChatGPT registers "https://chatgpt.com/connector/oauth/<random id per connector>", so it is matched by prefix. The two exact URIs are older / platform forms, not seen yet.
  chatgpt: { exact: ['https://chatgpt.com/connector_platform_oauth_redirect', 'https://platform.openai.com/apps-manage/oauth'], prefix: ['https://chatgpt.com/connector/oauth/'] },
  cursor: { prefix: ['cursor://anysphere.cursor-mcp/'] },
})

const MAX_URIS = 5
const MAX_URI_LEN = 500

/** MCP_REDIRECT_RULES: {"<host>": {"exact": ["https://..."], "prefix": ["cursor://..."]}}. A host named there REPLACES its default; anything malformed is ignored. Pure. */
export function parseRedirectRules(raw: string | undefined, base: RedirectRules = DEFAULT_REDIRECT_RULES): RedirectRules {
  if (!raw) return base
  try {
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object' || Array.isArray(j)) return base
    const out: Partial<Record<HostPlatform, HostRedirectRule>> = { ...base }
    const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= MAX_URI_LEN) : [])
    for (const [h, v] of Object.entries(j as Record<string, unknown>)) {
      if (!(HOST_PLATFORMS as readonly string[]).includes(h) || !v || typeof v !== 'object') continue
      const exact = strs((v as { exact?: unknown }).exact), prefix = strs((v as { prefix?: unknown }).prefix)
      out[h as HostPlatform] = { exact, prefix }
    }
    return out
  } catch { return base }
}

const matches = (uri: string, rule: HostRedirectRule | undefined): boolean =>
  !!rule && ((rule.exact ?? []).includes(uri) || (rule.prefix ?? []).some(p => p.endsWith('/') && uri.startsWith(p) && uri.length > p.length))

/** The Host a client is, or null. EVERY redirect URI must belong to ONE Host's rules; no URI, too many, a non-string, an over-long one, or a mix of Hosts all mean null. Pure. */
export function hostForRedirects(uris: unknown, rules: RedirectRules = DEFAULT_REDIRECT_RULES): HostPlatform | null {
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_URIS) return null
  if (!uris.every((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= MAX_URI_LEN && !/\s/.test(u))) return null
  for (const h of HOST_PLATFORMS) if ((uris as string[]).every(u => matches(u, rules[h]))) return h
  return null
}

export interface ResolvedClient { host: HostPlatform }
export type ClientLookup = (clientId: string) => Promise<{ redirect_uris?: unknown } | null>

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_OK_MS = 5 * 60_000
const TTL_NO_MS = 60_000

/** A cached resolver: client_id -> approved Host or null. A lookup that fails or answers nonsense is NOT approved (fail closed) and is remembered only briefly. */
export function createClientResolver(o: { lookup: ClientLookup; rules?: RedirectRules; now?: () => number }): (clientId: string) => Promise<ResolvedClient | null> {
  const now = o.now ?? Date.now
  const cache = new Map<string, { at: number; ttl: number; value: ResolvedClient | null }>()
  return async clientId => {
    if (!CLIENT_ID.test(clientId)) return null
    const hit = cache.get(clientId)
    if (hit && now() - hit.at < hit.ttl) return hit.value
    let value: ResolvedClient | null = null
    try {
      const c = await o.lookup(clientId)
      const host = c ? hostForRedirects(c.redirect_uris, o.rules ?? DEFAULT_REDIRECT_RULES) : null
      value = host ? { host } : null
    } catch { value = null }
    if (cache.size > 500) cache.clear()
    cache.set(clientId, { at: now(), ttl: value ? TTL_OK_MS : TTL_NO_MS, value })
    return value
  }
}

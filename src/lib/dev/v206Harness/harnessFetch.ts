// The one fetch wrapper the dev test harness installs. Two jobs, both enforced here and nowhere else:
//   1. the chips of the scenarios resolve from FIXED local profiles (no Wikipedia request, so the harness is deterministic and needs no network);
//   2. an endpoint that spends money (the chat route, deep research, speech, video) or writes to the database on its own (the anonymous-session mint the chat calls on every
//      first open) is refused with a 503 and is never forwarded, whatever the page tries.
import { HARNESS_PROFILES } from './fixtures'

const BLOCKED = /^\/api\/(chat|research|deep-research|tts|voice|media\/video|auth\/anonymous)(\/|$)/

/** True for a path the harness must never forward (paid, or a write nobody asked for). Accepts a pathname or a path with a query. Pure. */
export function isBlockedEndpoint(pathOrUrl: string): boolean {
  const path = pathOrUrl.split(/[?#]/)[0]
  return BLOCKED.test(path)
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export function createHarnessFetch(orig: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let url: URL
    try { url = new URL(raw, 'http://harness.local') } catch { return orig(input, init) }
    if (url.pathname === '/api/entity-profile') {
      const asked = url.searchParams.getAll('t').map(n => n.trim().toLowerCase())
      return json(200, { profiles: HARNESS_PROFILES.filter(p => asked.includes(p.name.toLowerCase())).map(p => ({ ...p })) })
    }
    if (isBlockedEndpoint(url.pathname)) return json(503, { error: 'dev test harness: no model, paid-service or session-minting calls' })
    return orig(input, init)
  }) as typeof fetch
}

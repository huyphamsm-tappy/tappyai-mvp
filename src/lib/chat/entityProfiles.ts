// Entity chips, the CLIENT side of the lookup: one batched GET for the names of an answer, a session cache so a name is asked once, and a re-check of everything that
// comes back (a response is data: the picture must be on upload.wikimedia.org, the link a Wikipedia article page, the text bounded). Nothing is invented here: a name the server
// did not return stays plain bold.
import { entityIcon, entityKey, type ChipInfo } from '@/lib/chat/entityChips'
import { isAllowedMediaPage } from '@/lib/media/mediaHosts'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

/** What the drawer shows of a real Wikipedia profile. */
export interface WikiEntity {
  name: string
  title: string
  description: string
  extract: string
  image: string | null
  href: string
  lang: 'vi' | 'en'
}

const ENDPOINT = '/api/entity-profile'
const cache = new Map<string, WikiEntity | null>()
const inflight = new Map<string, Promise<void>>()

const text = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

function image(u: unknown): string | null {
  if (typeof u !== 'string' || u.length > 1024 || !isSafeHttpsUrl(u)) return null
  try { const h = new URL(u).hostname; return h === 'upload.wikimedia.org' || h === 'thumb.wikimedia.org' ? u : null } catch { return null }
}

/** One item of the server's answer, re-checked; null when it is not a usable profile. Pure. */
export function readProfile(raw: unknown): WikiEntity | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = text(r.name, 80)
  const title = text(r.title, 120)
  const extract = text(r.extract, 800)
  if (!name || !title || !extract || r.source !== 'Wikipedia' || !isAllowedMediaPage(r.href)) return null
  return { name, title, description: text(r.description, 160), extract, image: image(r.image), href: r.href, lang: r.lang === 'en' ? 'en' : 'vi' }
}

/**
 * The profiles of `names` (the ones the server could resolve). Names asked before come from the session cache (also the ones that did NOT resolve); the rest go in ONE request.
 * Any failure yields no profile for those names (they stay plain bold) and is not cached, so a later answer may try again. Never throws.
 */
export async function fetchEntityProfiles(names: readonly string[], fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<Map<string, WikiEntity>> {
  const want = names.filter((n, i) => names.findIndex(m => entityKey(m) === entityKey(n)) === i)
  const missing = want.filter(n => !cache.has(entityKey(n)))
  if (missing.length) {
    const flightKey = missing.map(entityKey).sort().join('|')
    let p = inflight.get(flightKey)
    if (!p) {
      p = (async () => {
        try {
          const qs = missing.map(n => `t=${encodeURIComponent(n)}`).join('&')
          const res = await fetchImpl(`${ENDPOINT}?${qs}`, { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: 'application/json' } })
          if (!res.ok) return
          const j = (await res.json()) as { profiles?: unknown }
          const got = new Map<string, WikiEntity>()
          for (const raw of Array.isArray(j?.profiles) ? j.profiles.slice(0, 12) : []) {
            const prof = readProfile(raw)
            // only for a name that was asked: the server cannot add a chip for text that is not in the answer
            if (prof && missing.some(n => entityKey(n) === entityKey(prof.name))) got.set(entityKey(prof.name), prof)
          }
          for (const n of missing) cache.set(entityKey(n), got.get(entityKey(n)) ?? null)
        } catch { /* offline / blocked: plain bold */ } finally { inflight.delete(flightKey) }
      })()
      inflight.set(flightKey, p)
    }
    await p
  }
  const out = new Map<string, WikiEntity>()
  for (const n of want) { const e = cache.get(entityKey(n)); if (e) out.set(entityKey(n), e) }
  return out
}

/** The chips (name + icon) of the resolved profiles. Pure. */
export function chipsOf(profiles: ReadonlyMap<string, WikiEntity>): Map<string, ChipInfo> {
  const m = new Map<string, ChipInfo>()
  for (const [k, p] of profiles) m.set(k, { name: p.name, icon: entityIcon(p.description) })
  return m
}

/** Test hook. */
export const __clearEntityProfileCache = (): void => { cache.clear(); inflight.clear() }

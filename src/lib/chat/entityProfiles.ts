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

/** A subject the server resolved for the answer ([TAPPY_MEDIA] entity) as the profile the drawer shows: the same Wikipedia summary, picture and article. Pure. */
export function wikiFromMedia(e: { name: string; summary: string; image?: string; href: string }): WikiEntity {
  return { name: e.name, title: e.name, description: '', extract: e.summary, image: e.image ?? null, href: e.href, lang: /^https:\/\/en\./i.test(e.href) ? 'en' : 'vi' }
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

const SENSE_ENDPOINT = '/api/entity-profile/sense'
const senseCache = new Map<string, boolean>()
/** A short fingerprint of the answer's opening (the part the check reads), so the same name in another answer is asked again. Pure. */
const fingerprint = (s: string): string => { let h = 5381; for (const ch of s.slice(0, 1500)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36) }

/**
 * 18/11: a profile found BY NAME is shown only when it is about the same thing the answer talks about (a company in the user's document is not the commune of the same name). One request
 * per answer for the profiles not yet judged; the verdict is cached per name and answer. Any failure, a bad reply or a refusal: no chips for the unjudged names (a missing chip costs
 * less than a wrong one). Never throws.
 */
export async function confirmProfileSense(answer: string, profiles: ReadonlyMap<string, WikiEntity>, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<Map<string, WikiEntity>> {
  const fp = fingerprint(answer)
  const keyOf = (k: string) => `${k}|${fp}`
  const unjudged = [...profiles].filter(([k]) => !senseCache.has(keyOf(k)))
  if (unjudged.length && answer.trim()) {
    try {
      const res = await fetchImpl(SENSE_ENDPOINT, {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ answer: answer.slice(0, 1500), cards: unjudged.map(([, p]) => ({ name: p.name, summary: p.description ? `${p.description}. ${p.extract ?? ''}` : p.extract ?? '' })) }),
      })
      if (res.ok) {
        const j = (await res.json()) as { same?: unknown }
        if (Array.isArray(j?.same) && j.same.length === unjudged.length) unjudged.forEach(([k], i) => senseCache.set(keyOf(k), (j.same as unknown[])[i] === true))
      }
    } catch { /* offline / blocked: the unjudged names get no chip */ }
  }
  const out = new Map<string, WikiEntity>()
  for (const [k, p] of profiles) if (senseCache.get(keyOf(k)) === true) out.set(k, p)
  return out
}

/** The chips (name + icon) of the resolved profiles. Pure. */
export function chipsOf(profiles: ReadonlyMap<string, WikiEntity>): Map<string, ChipInfo> {
  const m = new Map<string, ChipInfo>()
  for (const [k, p] of profiles) m.set(k, { name: p.name, icon: entityIcon(p.description) })
  return m
}

/** Test hook. */
export const __clearEntityProfileCache = (): void => { cache.clear(); inflight.clear(); senseCache.clear() }

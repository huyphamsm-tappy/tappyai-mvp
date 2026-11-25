// 16/11 (owner's mockup: every subject card has a picture; owner approved web pictures for the cards Wikipedia cannot illustrate): the SERVER side of the subject-card pictures.
//
// The cards the model declared (present_blocks "profiles") get their first picture from Wikipedia on the client (the entity-profile lookup: an honest match only). For a subject Wikipedia does not
// know (an app, a course, a local brand), this finds ONE web picture, with the same image search, safe-https rule and logo/icon filter as the answer's item pictures. The search words are the
// subject's own name plus the title the model gave the comparison (the topic that disambiguates a bare name like "Be"). No model call, no guess: a subject with no usable picture gets none and its
// card keeps the initial. Bounded in count and time; any failure is silence. Pure apart from the injected lookups.
import { fetchWikiEntity } from '@/lib/media/wikiEntity'
import type { MediaEntity } from '@/lib/media/mediaHosts'
import { fetchPlacePhotosByName, type ImageContext } from '@/lib/ai/tools/common'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import type { SubjectImage } from '@/lib/answerDoc/subjectImages'
import { checkImagesMatchWithModel, type ImageToCheck } from './imageSense'

export interface SubjectToIllustrate { name: string; /** the comparison's own title: what the name is about */ hint?: string }

export interface SubjectImageDeps {
  wiki?: (subject: string, lang: string) => Promise<MediaEntity | null>
  webImages?: (query: string, context: ImageContext) => Promise<string[]>
  /** Does each picture show what it is meant to (imageSense.ts, one model call for all)? Default: the model looks at them. A picture it does not confirm is dropped. */
  verify?: (items: ImageToCheck[]) => Promise<boolean[]>
  timeoutMs?: number
}

/** How many pictures the search is asked for per subject / shot: the check keeps the first that shows the right thing, so a few candidates lose fewer pictures than one. */
export const CANDIDATES_PER_SHOT = 3

/**
 * The first picture of each subject / shot the check confirmed (the candidates of one subject come in search order). A failing check confirms nothing: a missing picture costs less than a wrong
 * one. All candidates of a turn go to the check in ONE call.
 */
async function confirmed(found: SubjectImage[], labelOf: (i: SubjectImage) => string, verify: SubjectImageDeps['verify']): Promise<SubjectImage[]> {
  if (!found.length) return []
  const check = verify ?? ((items: ImageToCheck[]) => checkImagesMatchWithModel(items))
  const ok = await check(found.map(i => ({ label: labelOf(i), src: i.src }))).catch(() => [] as boolean[])
  const taken = new Set<string>()
  return found.filter((i, k) => {
    if (ok[k] !== true || taken.has(i.name)) return false
    taken.add(i.name)
    return true
  })
}

/** At most this many subjects are looked up (a comparison has two or three; a list of six would cost six searches). */
export const MAX_SUBJECT_LOOKUPS = 4

export interface GalleryShot { caption: string; query: string }

/**
 * The pictures of a declared gallery: ONE web picture per shot, by the words the model gave (the search the model chose for that exact thing), through the same image search, safe-https rule and
 * logo/icon filter as the other pictures. A shot with no usable picture is left out; the client draws the gallery only when two or more remain. Bounded in count and time; any failure is silence.
 */
export async function resolveGalleryImages(shots: readonly GalleryShot[], deps: SubjectImageDeps = {}): Promise<SubjectImage[]> {
  const web = deps.webImages ?? ((q: string, c: ImageContext) => fetchPlacePhotosByName('', q, CANDIDATES_PER_SHOT, c))
  const byCaption = new Map(shots.map(s => [s.caption, s.query]))
  const run = (async (): Promise<SubjectImage[]> => {
    const found = (await Promise.all(shots.slice(0, 3).map(async (s): Promise<SubjectImage[]> => {
      const urls = await web(s.query.slice(0, 140), 'default').catch(() => [] as string[])
      return urls.filter(u => isSafeHttpsUrl(u)).slice(0, CANDIDATES_PER_SHOT).map(src => ({ name: s.caption, src }))
    }))).flat()
    return confirmed(found, i => `${i.name} (${byCaption.get(i.name) ?? ''})`, deps.verify)
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), deps.timeoutMs ?? 8000) })
  const out = await Promise.race([run, timeout])
  clearTimeout(timer)
  return out === 'timeout' ? [] : out
}

/** A stop of an itinerary that is a real place (it has an address, a map link or a place id) and has no picture of its own yet. `hint` = where it is (its address). */
export interface StopToIllustrate { name: string; hint?: string }
/** At most this many stops get a picture (an itinerary has ten to twenty; the first stops of each day are the ones people look at). */
export const MAX_STOP_LOOKUPS = 8

/**
 * The stops of the answer's [TAPPY_PLAN] that need a picture: real places (address, map link or place id; a transfer or "a meal downtown" is not) with no photo_url, in plan order, at most
 * MAX_STOP_LOOKUPS. Pure; a malformed plan gives none.
 */
export function planStopsWithoutPhoto(answer: string): StopToIllustrate[] {
  const a = answer.indexOf('[TAPPY_PLAN]')
  const b = answer.indexOf('[/TAPPY_PLAN]')
  if (a === -1 || b === -1 || b < a) return []
  try {
    const plan = JSON.parse(answer.slice(a + '[TAPPY_PLAN]'.length, b).trim()) as { days?: Array<{ items?: Array<Record<string, unknown>> }> }
    const out: StopToIllustrate[] = []
    const seen = new Set<string>()
    for (const day of plan.days ?? []) for (const it of day.items ?? []) {
      const name = typeof it.name === 'string' ? it.name.replace(/\s+/g, ' ').trim() : ''
      const address = typeof it.address === 'string' && it.address !== 'Xem bản đồ' ? it.address.replace(/\s+/g, ' ').trim() : ''
      // a landmark or an activity is a place worth a picture even when the plan wrote no address for it; a meal "downtown" or a transfer is not
      const sight = typeof it.category === 'string' && /^(activity|attraction|sight|entertainment|nature|culture)/i.test(it.category)
      const real = !!address || sight || (typeof it.maps_link === 'string' && it.maps_link) || (typeof it.place_id === 'string' && it.place_id)
      if (name.length < 2 || !real || (typeof it.photo_url === 'string' && it.photo_url) || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      out.push({ name, ...(address ? { hint: address } : {}) })
    }
    return out.slice(0, MAX_STOP_LOOKUPS)
  } catch { return [] }
}

/**
 * One web picture per stop, found by the stop's name and where it is, the same image search and safe-https / logo filter as every other picture, and confirmed by looking at it
 * (imageSense.ts): a stop whose pictures the check does not confirm shows none. Bounded in time; any failure is silence.
 */
export async function resolveStopImages(stops: readonly StopToIllustrate[], deps: SubjectImageDeps = {}): Promise<SubjectImage[]> {
  const web = deps.webImages ?? ((q: string, c: ImageContext) => fetchPlacePhotosByName('', q, CANDIDATES_PER_SHOT, c))
  const hints = new Map<string, string>()
  const run = (async (): Promise<SubjectImage[]> => {
    const found = (await Promise.all(stops.slice(0, MAX_STOP_LOOKUPS).map(async (s): Promise<SubjectImage[]> => {
      hints.set(s.name, s.hint ?? '')
      const urls = await web([s.name, s.hint].filter(Boolean).join(' ').slice(0, 140), 'travel').catch(() => [] as string[])
      return urls.filter(u => isSafeHttpsUrl(u)).slice(0, CANDIDATES_PER_SHOT).map(src => ({ name: s.name, src }))
    }))).flat()
    return confirmed(found, i => (hints.get(i.name) ? `${i.name} (${hints.get(i.name)})` : i.name), deps.verify)
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), deps.timeoutMs ?? 8000) })
  const out = await Promise.race([run, timeout])
  clearTimeout(timer)
  return out === 'timeout' ? [] : out
}

export async function resolveSubjectImages(subjects: readonly SubjectToIllustrate[], lang: string, deps: SubjectImageDeps = {}): Promise<SubjectImage[]> {
  const wiki = deps.wiki ?? ((s: string, l: string) => fetchWikiEntity(s, l))
  const web = deps.webImages ?? ((q: string, c: ImageContext) => fetchPlacePhotosByName('', q, CANDIDATES_PER_SHOT, c))
  const hints = new Map<string, string>()
  const run = (async (): Promise<SubjectImage[]> => {
    const found = (await Promise.all(subjects.slice(0, MAX_SUBJECT_LOOKUPS).map(async (s): Promise<SubjectImage[]> => {
      const name = s.name.replace(/\s+/g, ' ').trim()
      if (name.length < 2) return []
      // Wikipedia's picture wins and is found by the client: a subject it can illustrate costs no web search here
      const article = await wiki(name, lang).catch(() => null)
      if (article?.image) return []
      const hint = s.hint?.replace(/\s+/g, ' ').trim() ?? ''
      hints.set(name, hint)
      const query = [name, hint].filter(Boolean).join(' ').slice(0, 140)
      const urls = await web(query, 'default').catch(() => [] as string[])
      return urls.filter(u => isSafeHttpsUrl(u)).slice(0, CANDIDATES_PER_SHOT).map(src => ({ name, src }))
    }))).flat()
    return confirmed(found, i => (hints.get(i.name) ? `${i.name} (${hints.get(i.name)})` : i.name), deps.verify)
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), deps.timeoutMs ?? 8000) })
  const out = await Promise.race([run, timeout])
  clearTimeout(timer)
  return out === 'timeout' ? [] : out
}

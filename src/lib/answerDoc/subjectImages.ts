// 16/11 (owner's mockup: every subject card has a picture): the pictures of the SUBJECT CARDS the model declared (present_blocks, "profiles"), as an ANNOTATION (tappy.subject_images.v1), shared by
// server and client. Pure, no I/O. A card's first picture is Wikipedia's (the entity-profile lookup, honest match only); this carries the web picture a subject gets ONLY when Wikipedia has none.
//
// Like the item pictures (answerDoc/media.ts) it is never part of the answer text: web images are live-only and never persisted. The client keeps them for the life of the tab across the save
// navigation (a module-scoped Map, nothing on disk) and re-checks every URL before rendering.
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { placesViewKey } from '@/lib/recommendation/liveViewCache'

export const SUBJECT_IMAGES_KIND = 'tappy.subject_images.v1' as const

/** One picture for one subject card, matched to the card by the subject's name. */
export interface SubjectImage { name: string; src: string }
/** `images`: the subject cards' pictures (by subject name). `gallery`: the pictures of a declared gallery block (by caption, in the order declared). */
export interface SubjectImagesAnnotation { kind: typeof SUBJECT_IMAGES_KIND; v: 1; images: SubjectImage[]; gallery?: SubjectImage[]; /** the itinerary's stops that had no picture of their own (by stop name) */ stops?: SubjectImage[] }

const MAX_IMAGES = 6
const MAX_GALLERY_IMAGES = 3
const MAX_STOP_IMAGES = 10
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

function cleanList(list: unknown, cap: number): SubjectImage[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  return list.flatMap((x): SubjectImage[] => {
    const o = (x ?? {}) as unknown as Record<string, unknown>
    const name = clean(o.name, 80)
    if (!name || seen.has(name.toLowerCase()) || typeof o.src !== 'string' || o.src.length > 2048 || !isSafeHttpsUrl(o.src)) return []
    seen.add(name.toLowerCase())
    return [{ name, src: o.src }]
  }).slice(0, cap)
}

/** Re-validates one annotation (server before emitting, client before rendering). Nothing valid → null. */
export function sanitizeSubjectImages(raw: unknown): SubjectImagesAnnotation | null {
  const r = raw as Partial<SubjectImagesAnnotation> | null
  if (!r || typeof r !== 'object' || r.kind !== SUBJECT_IMAGES_KIND || r.v !== 1) return null
  const images = cleanList(r.images, MAX_IMAGES)
  const gallery = cleanList(r.gallery, MAX_GALLERY_IMAGES)
  const stops = cleanList(r.stops, MAX_STOP_IMAGES)
  return images.length || gallery.length || stops.length ? { kind: SUBJECT_IMAGES_KIND, v: 1, images, ...(gallery.length ? { gallery } : {}), ...(stops.length ? { stops } : {}) } : null
}

/** Client: the subject pictures among a message's annotations (the last valid one wins), or null. */
export function readSubjectImages(annotations: unknown[] | undefined | null): SubjectImagesAnnotation | null {
  if (!Array.isArray(annotations)) return null
  let out: SubjectImagesAnnotation | null = null
  for (const a of annotations) { const v = sanitizeSubjectImages(a); if (v) out = v }
  return out
}

export function subjectImagesFrame(a: SubjectImagesAnnotation): string {
  return '8:' + JSON.stringify([a]) + '\n'
}

/** A subject name as the key cards and pictures are matched by: case, accents and spacing do not matter. */
export const subjectKey = (name: string): string => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim()

/** name → picture, for the cards. */
export function subjectImageMap(a: SubjectImagesAnnotation | null): ReadonlyMap<string, string> {
  return new Map((a?.images ?? []).map(i => [subjectKey(i.name), i.src]))
}

/** caption → picture, for the gallery block. */
export function galleryImageMap(a: SubjectImagesAnnotation | null): ReadonlyMap<string, string> {
  return new Map((a?.gallery ?? []).map(i => [subjectKey(i.name), i.src]))
}

/** stop name → picture, for an itinerary's stops that have none of their own. */
export function stopImageMap(a: SubjectImagesAnnotation | null): ReadonlyMap<string, string> {
  return new Map((a?.stops ?? []).map(i => [subjectKey(i.name), i.src]))
}

const MAX_ENTRIES = 20
const cache = new Map<string, SubjectImagesAnnotation>()

export function rememberSubjectImages(content: string, a: SubjectImagesAnnotation): void {
  const key = placesViewKey(content)
  if (!key) return
  cache.delete(key)
  cache.set(key, a)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function recallSubjectImages(content: string): SubjectImagesAnnotation | null {
  return cache.get(placesViewKey(content)) ?? null
}

/** Test-only. */
export function __resetSubjectImagesCache(): void {
  cache.clear()
}

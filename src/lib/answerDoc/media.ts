// TAPPY_ANSWER_V4 layer 2 — the item pictures of an answer as an ANNOTATION (tappy.doc_media.v1), shared by server and client. Pure, no I/O.
//
// Never part of the answer text: Serper images are live-only and never persisted (tools/common.ts), so a saved message does not carry them.
// The client keeps them for the life of the tab across the save navigation (same hand-off as the place card / turn status: a module-scoped
// Map, nothing on disk, nothing sent anywhere) and re-checks every URL before rendering.
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { isAllowedMediaPage } from '@/lib/media/mediaHosts'
import { placesViewKey } from '@/lib/recommendation/liveViewCache'

export const DOC_MEDIA_KIND = 'tappy.doc_media.v1' as const

/** One picture for one item of the answer, matched to the item by its title (titleKey). */
export interface DocItemImage { title: string; src: string; source: 'wikipedia' | 'web'; href?: string }
export interface DocMediaAnnotation { kind: typeof DOC_MEDIA_KIND; v: 1; items: DocItemImage[] }

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Re-validates one annotation (server before emitting, client before rendering). Nothing valid → null. */
export function sanitizeDocMedia(raw: unknown): DocMediaAnnotation | null {
  const r = raw as Partial<DocMediaAnnotation> | null
  if (!r || typeof r !== 'object' || r.kind !== DOC_MEDIA_KIND || r.v !== 1 || !Array.isArray(r.items)) return null
  const items = r.items.flatMap((x): DocItemImage[] => {
    const o = (x ?? {}) as unknown as Record<string, unknown>
    const title = clean(o.title, 80)
    if (!title || typeof o.src !== 'string' || o.src.length > 2048 || !isSafeHttpsUrl(o.src)) return []
    const source = o.source === 'wikipedia' ? 'wikipedia' : 'web'
    return [{ title, src: o.src, source, ...(isAllowedMediaPage(o.href) ? { href: o.href as string } : {}) }]
  }).slice(0, 8)
  return items.length ? { kind: DOC_MEDIA_KIND, v: 1, items } : null
}

/** Client: the doc media among a message's annotations (the last valid one wins), or null. */
export function readDocMedia(annotations: unknown[] | undefined | null): DocMediaAnnotation | null {
  if (!Array.isArray(annotations)) return null
  let out: DocMediaAnnotation | null = null
  for (const a of annotations) { const v = sanitizeDocMedia(a); if (v) out = v }
  return out
}

export function docMediaFrame(a: DocMediaAnnotation): string {
  return '8:' + JSON.stringify([a]) + '\n'
}

const MAX_ENTRIES = 20
const cache = new Map<string, DocMediaAnnotation>()

export function rememberDocMedia(content: string, a: DocMediaAnnotation): void {
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

export function recallDocMedia(content: string): DocMediaAnnotation | null {
  return cache.get(placesViewKey(content)) ?? null
}

/** Test-only. */
export function __resetDocMediaCache(): void {
  cache.clear()
}

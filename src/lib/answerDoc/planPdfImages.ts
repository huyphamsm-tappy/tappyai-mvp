// The pictures of a trip plan PDF (owner 20/11: the downloaded plan had no pictures). Only the pictures the plan card already shows are used: a stop's own photo, else the one found for it
// (the same rule as the card). The browser cannot read most photo hosts directly (no CORS), so each picture is fetched through /api/pdf-image, shrunk on a canvas and kept as a JPEG data URL.
// A picture that cannot be loaded is simply left out; the PDF never waits on one for long and never fails because of one.
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export interface PlanPhoto { name: string; url: string }
export interface LoadedPhoto { name: string; dataUrl: string }

/** At most this many pictures go into the file (a plan has 12-20 stops; a long gallery is not a better file). */
export const MAX_PDF_PHOTOS = 8

interface PhotoPlan { days?: Array<{ items?: Array<{ name?: unknown; photo_url?: unknown }> }> }

/** The pictures a plan PDF may carry, in plan order, one per picture address. `keyOf` turns a stop name into the key of `stopImages` (the card's own rule). Pure. */
export function planPhotoList(plan: PhotoPlan, stopImages: ReadonlyMap<string, string> | undefined, keyOf: (name: string) => string): PlanPhoto[] {
  const out: PlanPhoto[] = []
  const seen = new Set<string>()
  for (const d of plan.days ?? []) for (const it of d.items ?? []) {
    if (out.length >= MAX_PDF_PHOTOS) return out
    const name = typeof it?.name === 'string' ? it.name.replace(/\s+/g, ' ').trim() : ''
    if (!name) continue
    const own = typeof it.photo_url === 'string' ? it.photo_url : ''
    const found = stopImages?.get(keyOf(name)) ?? ''
    const url = own && isSafeHttpsUrl(own) ? own : found && isSafeHttpsUrl(found) ? found : ''
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ name: name.slice(0, 80), url })
  }
  return out
}

/** One picture as a JPEG data URL no wider than `maxWidth`, or undefined (not in a browser, the route said no, too slow, not decodable). */
export async function loadPdfImage(url: string, maxWidth = 520, timeoutMs = 8000): Promise<string | undefined> {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return undefined
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    let blob: Blob
    try {
      const res = await fetch(`/api/pdf-image?u=${encodeURIComponent(url)}`, { signal: ctl.signal })
      if (!res.ok) return undefined
      blob = await res.blob()
    } finally { clearTimeout(timer) }
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxWidth / bmp.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch { return undefined }
}

/** The listed pictures, loaded in parallel; the ones that could not be loaded are dropped, the order is kept. */
export async function loadPlanGallery(list: readonly PlanPhoto[]): Promise<LoadedPhoto[]> {
  const loaded = await Promise.all(list.map(async p => ({ name: p.name, dataUrl: await loadPdfImage(p.url) })))
  return loaded.filter((p): p is LoadedPhoto => !!p.dataUrl)
}

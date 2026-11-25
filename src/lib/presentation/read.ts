// Layout slice 3 (14/11/2026): the client's reader of the live frame `tappy.presentation.v1` (CONSULT_PRESENT_BLOCKS), and the tab-lifetime hand-off that keeps the blocks across the save navigation.
//
// The client trusts nothing in the frame: the contract goes through parsePresentation again, only the three kinds the model may declare are kept, a booking needs a valid https link for ITS id
// (else it is dropped: a booking card is always actionable), and a link for anything else is ignored. Pure: no network, no I/O.
import { parsePresentation, type Presentation, type PresentationBlock } from './contract'
import type { BookingLink } from './declare'

export const PRESENTATION_FRAME_KIND = 'tappy.presentation.v1'
// 16/11: 'gallery' joins the kinds the model may declare (its pictures come separately, from the server's subject-images annotation)
const DECLARED = new Set(['compare', 'profiles', 'gallery', 'ask', 'booking'])
const HANDOFFS = new Set(['guest', 'merchant_login', 'app'])

export interface PresentationFrame { presentation: Presentation; links: Record<string, BookingLink> }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function readLink(raw: unknown): BookingLink | null {
  if (!isObj(raw)) return null
  const { url, label, providerId, handoff } = raw
  if (typeof url !== 'string' || url.length > 2000) return null
  try { if (new URL(url).protocol !== 'https:') return null } catch { return null }
  if (typeof label !== 'string' || !label.trim() || label.length > 80) return null
  if (typeof providerId !== 'string' || providerId.length > 40) return null
  if (typeof handoff !== 'string' || !HANDOFFS.has(handoff)) return null
  return { url, label: label.trim(), providerId, handoff: handoff as BookingLink['handoff'] }
}

/** The message's presentation frame (the last one), checked; null when nothing drawable is in it. Never throws. */
export function readPresentationFrame(annotations: unknown): PresentationFrame | null {
  try {
    if (!Array.isArray(annotations)) return null
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      if (!isObj(a) || a.kind !== PRESENTATION_FRAME_KIND || a.v !== 1) continue
      const parsed = parsePresentation(a.presentation)
      if (!parsed) return null
      const rawLinks = isObj(a.links) ? a.links : {}
      const links: Record<string, BookingLink> = {}
      const blocks: PresentationBlock[] = []
      for (const b of parsed.blocks) {
        if (!DECLARED.has(b.type)) continue
        if (b.type === 'booking') {
          const link = readLink(rawLinks[b.id])
          if (!link) continue
          links[b.id] = link
        }
        blocks.push(b)
      }
      return blocks.length ? { presentation: { v: parsed.v, blocks }, links } : null
    }
    return null
  } catch {
    return null
  }
}

// ── The frame, for as long as the tab lives ──────────────────────────────────
// The save navigates to /chat/<id> and the annotation does not survive it (see liveViewCache.ts, the same reason). An in-memory Map, never storage: gone on reload, bounded. The key is the
// whole text's shape (length, opening, ending) so that two answers that open alike do not share blocks.
const MAX_ENTRIES = 20
const cache = new Map<string, PresentationFrame>()

export function presentationKey(content: string): string {
  const t = (content || '').trim()
  return t ? `${t.length}:${t.slice(0, 160)}:${t.slice(-80)}` : ''
}

export function rememberPresentation(content: string, frame: PresentationFrame): void {
  const key = presentationKey(content)
  if (!key) return
  cache.delete(key)
  cache.set(key, frame)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function recallPresentation(content: string): PresentationFrame | null {
  const key = presentationKey(content)
  return key ? cache.get(key) ?? null : null
}

/** Test-only. */
export function __resetPresentationCache(): void { cache.clear() }

import { normalizeVN } from './intent'
import { buildShoppingLinks, type PlatformLink } from '@/lib/platformLinks/shopping'

// ── «Only another phone model was found» (A3, owner 2026-10-02) ────────────────────────────────────────────────────────
//
// Owner UAT: «kính cường lực iPhone 17» → one product picture alone, «Còn 1 lựa chọn nữa», and prose saying «chỉ thấy iPhone 15 Pro
// Max». A screen protector for another model does not fit: that listing is not a result for the question, and its picture must never
// stand in for one. When the user named a phone model and EVERY listing found names a different one, the turn shows no card and no
// picture (nothing here is a result), says so plainly, and gives search links for the right keyword — built by code from the
// marketplace search grammars in the CCP registry (buildShoppingLinks), never by the model.

export interface DeviceRef { family: 'iphone' | 'galaxy'; gen: string; variant: string; series: boolean }

const IPHONE = /\biphone\s*(\d{1,2})\s*(pro\s*max|promax|pro|plus|max|mini|air|e)?\b(\s*series)?/g
const GALAXY = /\bgalaxy\s*(s|a|z\s*flip|z\s*fold|note)\s*(\d{1,2})\s*(ultra|plus|\+|fe)?\b/g

const squash = (s: string) => s.replace(/\s+/g, '')

/** Every phone model a text names (diacritics folded, case folded). */
export function devicesIn(text: string): DeviceRef[] {
  const t = normalizeVN((text || '').toLowerCase())
  const out: DeviceRef[] = []
  for (const m of t.matchAll(IPHONE)) {
    out.push({ family: 'iphone', gen: m[1], variant: squash(m[2] ?? ''), series: !!m[3] })
  }
  for (const m of t.matchAll(GALAXY)) {
    out.push({ family: 'galaxy', gen: `${squash(m[1])}${m[2]}`, variant: squash(m[3] ?? '').replace('+', 'plus'), series: false })
  }
  return out
}

export const deviceLabel = (d: DeviceRef): string =>
  d.family === 'iphone'
    ? `iPhone ${d.gen}${d.variant ? ` ${({ promax: 'Pro Max', pro: 'Pro', max: 'Max', plus: 'Plus', mini: 'Mini', air: 'Air', e: 'e' } as Record<string, string>)[d.variant] ?? d.variant}` : ''}`
    : `Galaxy ${d.gen.toUpperCase()}${d.variant ? ` ${d.variant[0].toUpperCase()}${d.variant.slice(1)}` : ''}`

const sameDevice = (a: DeviceRef, b: DeviceRef): boolean => a.family === b.family && a.gen === b.gen && (a.variant === b.variant || (b.series && a.gen === b.gen) || (a.series && a.gen === b.gen))

export interface WrongModel { requested: DeviceRef; found: DeviceRef[] }

/**
 * The phone model the user asked for (newest user text that names one) against the models the listings name.
 * Returns the mismatch only when EVERY listing names a phone model, none is the requested one, and none is a «series» title that covers it.
 * A listing that names no model at all is neutral and prevents the verdict (it may well fit; nothing here can say it does not).
 */
export function detectWrongModel(userTexts: readonly string[], listingTitles: readonly string[]): WrongModel | null {
  let requested: DeviceRef | null = null
  for (let i = userTexts.length - 1; i >= 0 && !requested; i--) {
    const d = devicesIn(userTexts[i])
    if (d.length) requested = d[d.length - 1]
  }
  if (!requested || listingTitles.length === 0) return null
  const found: DeviceRef[] = []
  for (const title of listingTitles) {
    const devs = devicesIn(title).filter(d => d.family === requested!.family)
    if (devs.length === 0) return null // a listing naming no model of this family: neutral, no verdict
    if (devs.some(d => sameDevice(requested!, d))) return null
    found.push(...devs)
  }
  const seen = new Set<string>()
  const uniq = found.filter(d => { const k = deviceLabel(d); if (seen.has(k)) return false; seen.add(k); return true })
  return { requested, found: uniq }
}

/** The search keyword for the right product: the tool's own query when it already names the requested model, else the model appended. */
export function rightKeyword(query: string, requested: DeviceRef): string {
  const q = (query || '').replace(/\s+/g, ' ').trim()
  const label = deviceLabel(requested)
  if (!q) return label
  return devicesIn(q).some(d => sameDevice(requested, d)) ? q : `${q.replace(new RegExp(IPHONE.source, 'gi'), '').replace(new RegExp(GALAXY.source, 'gi'), '').replace(/\s+/g, ' ').trim()} ${label}`.trim()
}

export interface WrongModelBlock { text: string; links: PlatformLink[]; keyword: string }


/** The code-built reply block: what was (not) found, and one search link per marketplace for the right keyword. */
export function wrongModelBlock(w: WrongModel, query: string, lang: string): WrongModelBlock {
  const keyword = rightKeyword(query, w.requested)
  const links = buildShoppingLinks(keyword)
  const asked = deviceLabel(w.requested)
  const got = w.found.slice(0, 3).map(deviceLabel).join(', ')
  const text = lang === 'en'
    ? `I only found listings for ${got}, not for ${asked} — they are a different size and would not fit, so I am not showing them as results. Search for “${keyword}” yourself on:`
    : `Mình chỉ thấy hàng cho ${got}, chưa thấy loại đúng cho ${asked} — khác kích thước nên không dùng được, mình không đưa chúng ra như kết quả. Bạn tìm từ khóa “${keyword}” trên:`
  return { text, links, keyword }
}

/** Insert a block after the prose and before the first structured marker ([FOLLOWUPS], [CTA_BUTTONS], [TAPPY_*]). */
export function insertBeforeMarkers(text: string, block: string): string {
  const m = /\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_[A-Z_]+)\]/.exec(text)
  return m ? `${text.slice(0, m.index).trimEnd()}\n\n${block}\n\n${text.slice(m.index)}` : `${text.trimEnd()}\n\n${block}`
}

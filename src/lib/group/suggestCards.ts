// The group's suggestion as THREE CARDS of REAL places (owner 20/11): the places are searched for the group's area and tastes, the model only CHOOSES among the rows found and says why each suits
// the group, and every fact on a card (name, address, rating, links) is read from the place row, never from the model. Pure; the words come from the plain dictionary map (no 'use client' import).
import { vi as VI } from '@/lib/i18n/presentation'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export interface Candidate { name: string; address?: string; rating?: number; maps_link?: string; photo_url?: string; photo_urls?: string[] }
export interface SuggestionCard { id: string; name: string; address?: string; rating?: number; why: string; maps_link?: string; photo_url?: string }
export interface Pick { index: number; why: string }

const MAX_CARDS = 3
const txt = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')
const fill = (key: string, vars: Record<string, string>): string => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), VI[key] ?? key)

/** The area most members gave (the first one on a tie); empty when nobody gave one. */
export function pickArea(members: ReadonlyArray<{ area?: unknown }>): string {
  const count = new Map<string, { n: number; first: number; label: string }>()
  members.forEach((m, i) => {
    const label = txt(m.area, 80)
    if (!label) return
    const key = label.toLowerCase()
    const cur = count.get(key)
    if (cur) cur.n++
    else count.set(key, { n: 1, first: i, label })
  })
  return [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0]?.label ?? ''
}

/** The tastes people shared, each word once, as one short search query. */
export function foodQuery(members: ReadonlyArray<{ food_preferences?: unknown }>): string {
  const seen = new Set<string>()
  const words: string[] = []
  for (const m of members) for (const w of txt(m.food_preferences, 200).toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    if (!seen.has(w)) { seen.add(w); words.push(w) }
  }
  return words.slice(0, 8).join(' ')
}

/** What the model reads: the members and the numbered places it may choose among. */
export function buildPickPrompt(groupName: string, memberLines: readonly string[], candidates: readonly Candidate[]): string {
  const list = candidates.map((c, i) => `${i + 1}. ${txt(c.name, 80)}${c.address ? ` - ${txt(c.address, 120)}` : ''}${typeof c.rating === 'number' ? ` (rating ${c.rating})` : ''}`).join('\n')
  return `A group "${txt(groupName, 60)}" wants to eat together. The people:
${memberLines.join('\n')}

These are the real places found for the group (choose ONLY among them, never add one):
${list}

Choose up to ${MAX_CARDS} places that suit EVERYONE (budget, tastes, restrictions, area). Answer with ONLY a JSON array, no other text: [{"n": <number of the place>, "why": "<one short sentence in Vietnamese: why it suits this group>"}]`
}

/** The choices in the model's answer: JSON anywhere in the text; unknown numbers, repeats and anything past three are dropped. */
export function parsePicks(text: string, candidateCount: number): Pick[] {
  const s = String(text ?? '')
  const a = s.indexOf('['), b = s.lastIndexOf(']')
  if (a < 0 || b <= a) return []
  let raw: unknown
  try { raw = JSON.parse(s.slice(a, b + 1)) } catch { return [] }
  if (!Array.isArray(raw)) return []
  const out: Pick[] = []
  const used = new Set<number>()
  for (const r of raw) {
    const n = (r as { n?: unknown })?.n
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > candidateCount || used.has(n)) continue
    used.add(n)
    out.push({ index: n - 1, why: txt((r as { why?: unknown }).why, 200) })
    if (out.length >= MAX_CARDS) break
  }
  return out
}

const safeLink = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 1500 && isSafeHttpsUrl(v) ? v : undefined)

/** Up to three cards: the model's choices first, then the best rated places not yet chosen (with a factual reason). */
export function cardsFrom(candidates: readonly Candidate[], picks: readonly Pick[], area: string): SuggestionCard[] {
  const chosen = picks.filter(p => candidates[p.index]).slice(0, MAX_CARDS)
  const taken = new Set(chosen.map(p => p.index))
  const rest = candidates.map((c, i) => ({ c, i })).filter(x => !taken.has(x.i)).sort((x, y) => (y.c.rating ?? 0) - (x.c.rating ?? 0) || x.i - y.i)
  const order: Array<{ index: number; why: string }> = [...chosen]
  for (const r of rest) {
    if (order.length >= MAX_CARDS) break
    const rated = typeof r.c.rating === 'number' && Number.isFinite(r.c.rating) && r.c.rating > 0
    order.push({ index: r.i, why: rated ? fill('groupDining.whyRated', { rating: String(r.c.rating), area: area || '-' }) : fill('groupDining.whyArea', { area: area || '-' }) })
  }
  return order.slice(0, MAX_CARDS).map(({ index, why }, k): SuggestionCard => {
    const c = candidates[index]
    const rating = typeof c.rating === 'number' && Number.isFinite(c.rating) && c.rating > 0 && c.rating <= 5 ? c.rating : undefined
    const address = txt(c.address, 120)
    const maps = safeLink(c.maps_link)
    const photo = safeLink(c.photo_url) ?? safeLink(c.photo_urls?.[0])
    return { id: String(k + 1), name: txt(c.name, 80), ...(address ? { address } : {}), ...(rating !== undefined ? { rating } : {}), why: txt(why, 200), ...(maps ? { maps_link: maps } : {}), ...(photo ? { photo_url: photo } : {}) }
  })
}

/** The same places as plain text, for the clients that show only text (the mobile apps read `suggestion`). */
export function renderSuggestionText(cards: readonly SuggestionCard[]): string {
  const lines = cards.map((c, i) => `${i + 1}. ${c.name}${c.why ? ` - ${c.why}` : ''}${c.address ? `\n   ${c.address}` : ''}`)
  return [VI['groupDining.suggestIntro'], ...lines].join('\n')
}

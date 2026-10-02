// ── EMPTY PLACE RESULT: RELAX STEP BY STEP, SAY SO, NEVER A DEAD END — chat2 A2 (2026-10-02) ──────
//
// Owner report: "Quận trung tâm · Món Việt · Trên 300k" ended on "Chưa có quán Việt nào trong kết
// quả… Bạn muốn nói sang khu vực lân cận không?" — a question instead of an answer.
//
// Product rule (owner): ONLY the venue / dish type and the area are HARD. Price and distance are
// SOFT. When a hard filter leaves nothing:
//   1. drop the price filter  (a stated ceiling that every priced venue exceeds),
//   2. widen the area         (the whole city, one more provider call),
// and the reply SAYS what was relaxed. If still nothing: an honest "tìm '…' nhưng chưa thấy kết quả đủ
// tin cậy", a Google Maps button built by CODE from the keywords, and a few reasonable next steps.
//
// A venue with NO price data is never dropped by a price ceiling (placeConstraintFilter keeps it,
// marked `_tappy_price_unconfirmed`) — verified in placeRelax.test.ts with a realistic fixture.
// Pure functions + one async orchestrator that takes its side effects as callbacks.

import type { ConstraintFilterOutcome, PlaceConstraints } from './placeConstraintFilter'

export type RelaxStep = 'price' | 'area'

export const rowsOf = (result: unknown): Array<Record<string, unknown>> => {
  const rows = result && typeof result === 'object' ? (result as { results?: unknown }).results : undefined
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
}

export interface RelaxInput {
  /** The geography-guarded, budget-filtered provider result BEFORE `applyPlaceConstraints`. */
  budgeted: unknown
  constrained: ConstraintFilterOutcome
  constraints: PlaceConstraints
  lang: string
  /** Re-runs the row constraints (the route's `applyPlaceConstraints`). */
  applyConstraints: (result: unknown, c: PlaceConstraints) => ConstraintFilterOutcome
  /** One provider call for the whole city (geography-guarded), or null when there is nothing to widen. */
  widen?: () => Promise<unknown | null>
}

export interface RelaxOutcome {
  /** The result the model and the cards read (with `_tappy_relax_note` when something was relaxed). */
  result: unknown
  relaxed: RelaxStep[]
  /** True when, after every step, there is still no row. */
  empty: boolean
}

/** What was relaxed, as a sentence the model must relay (and the log can carry). */
export function relaxNote(steps: readonly RelaxStep[], c: { budgetMax: number | null; district: string | null }, lang: string): string {
  const vi = lang !== 'en'
  const price = c.budgetMax !== null ? (c.budgetMax >= 1_000_000 ? `${c.budgetMax / 1_000_000} ${vi ? 'triệu' : 'million'}` : `${Math.round(c.budgetMax / 1000)}k`) : ''
  const parts: string[] = []
  if (steps.includes('price')) parts.push(vi ? `bỏ lọc giá${price ? ` (${price})` : ''} vì không có quán nào khớp` : `dropped the price filter${price ? ` (${price})` : ''} because nothing matched`)
  if (steps.includes('area')) parts.push(vi ? `mở rộng ra cả thành phố${c.district ? ` (ngoài ${c.district})` : ''}` : `widened the search to the whole city${c.district ? ` (beyond ${c.district})` : ''}`)
  if (parts.length === 0) return ''
  return vi
    ? `HỆ THỐNG ĐÃ NỚI TIÊU CHÍ: ${parts.join('; ')}. NÓI RÕ điều này ngay câu đầu ("Mình đã ${parts.join(' và ')}…"); với chỗ không có dữ liệu giá thì viết "chưa có thông tin giá". KHÔNG hỏi lại user điều họ đã nói.`
    : `THE SYSTEM RELAXED THE CRITERIA: ${parts.join('; ')}. SAY SO in the first sentence; for a venue with no price data write "no price info yet". Do NOT ask the user back what they already said.`
}

export async function relaxEmptyPlaces(input: RelaxInput): Promise<RelaxOutcome> {
  const { constrained, constraints, lang } = input
  if (rowsOf(constrained.result).length > 0) return { result: constrained.result, relaxed: [], empty: false }
  const withNote = (res: unknown, steps: RelaxStep[]): unknown => {
    if (!res || typeof res !== 'object') return res
    return { ...(res as Record<string, unknown>), _tappy_relaxed: steps, _tappy_relax_note: relaxNote(steps, { budgetMax: constraints.budgetMax, district: constraints.district?.label ?? null }, lang) }
  }
  const relaxedConstraints: PlaceConstraints = { ...constraints, budgetMax: null }

  // Step 1 — price is SOFT. Only worth a second pass when there were rows and a ceiling dropped them.
  if (constraints.budgetMax !== null && rowsOf(input.budgeted).length > 0) {
    const again = input.applyConstraints(input.budgeted, relaxedConstraints)
    if (rowsOf(again.result).length > 0) return { result: withNote(again.result, ['price']), relaxed: ['price'], empty: false }
  }
  // Step 2 — the area is widened to the city (one provider call).
  if (input.widen) {
    const wide = await input.widen()
    if (rowsOf(wide).length > 0) {
      const again = input.applyConstraints(wide, relaxedConstraints)
      const steps: RelaxStep[] = constraints.budgetMax !== null && rowsOf(input.budgeted).length > 0 ? ['price', 'area'] : ['area']
      if (rowsOf(again.result).length > 0) return { result: withNote(again.result, steps), relaxed: steps, empty: false }
    }
  }
  return { result: constrained.result, relaxed: [], empty: true }
}

// ── The honest no-result block (built by code) ──────────────────────────────────────────────────

/** A Google Maps search link for the keywords + area — built here, never written by the model. */
export function mapsSearchUrl(query: string, area?: string | null): string {
  const q = [query, area].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export interface NoResultInput { query: string; area?: string | null; lang: string }

/**
 * The reply when nothing reliable was found after every relaxation: one honest sentence, the Maps
 * button, and reasonable next steps as chips. Never a question that repeats what the user said.
 */
export function noResultBlock(i: NoResultInput): string {
  const vi = i.lang !== 'en'
  const where = i.area?.trim()
  const sentence = vi
    ? `Mình đã tìm "${i.query}"${where ? ` ở ${where}` : ''} nhưng chưa thấy kết quả đủ tin cậy để gợi ý. Bạn có thể xem nhanh trên Google Maps, hoặc thử một trong các hướng bên dưới.`
    : `I searched for "${i.query}"${where ? ` in ${where}` : ''} but found nothing reliable enough to recommend. You can check Google Maps directly, or try one of the options below.`
  const cta = { buttons: [{ label: vi ? 'Tìm trên Google Maps' : 'Search on Google Maps', type: 'maps', url: mapsSearchUrl(i.query, where), primary: true }] }
  const chips = vi ? ['Tìm trên cả TP.HCM', 'Đổi từ khóa khác', 'Gợi ý chỗ gần mình'] : ['Search the whole city', 'Try other keywords', 'Suggest places near me']
  return `\n\n${sentence}\n\n[CTA_BUTTONS]${JSON.stringify(cta)}[/CTA_BUTTONS]\n[FOLLOWUPS]${chips.join('|')}[/FOLLOWUPS]`
}

/** The city to widen a district search to (Ho Chi Minh City by default), or null when no district was stated. */
export function widenLocation(stated: { city: 'hcm' | 'hn' } | null | undefined): string | null {
  if (!stated) return null
  return stated.city === 'hn' ? 'Ha Noi' : 'Ho Chi Minh City'
}

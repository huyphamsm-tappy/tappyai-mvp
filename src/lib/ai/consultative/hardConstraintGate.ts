// ── THE HARD-CONSTRAINT GATE — one choke point every tool result passes through ────────────
//
// Owner audit A.3 (2026-09-19): the gap classification (hardConstraints.ts) was wired inside the
// `search_places` branch of the route only. A hotel turn ("resort … sang chút", "khách sạn mở
// khuya") got no gap, no heads-up and no atmosphere guard, and a new vertical would have been
// born the same way. This module is the single place the classification happens: the route
// wraps EVERY tool's `execute` with `gateToolResult` (next to `timeTools`), so a tool that does
// not name itself here is still seen — and logged — rather than silently ungated.
//
//   applicable  search_places, get_hotel_prices — rows are places; the gate annotates the result
//               (`_tappy_hard_gaps`, `_tappy_hard_contrary`, `_tappy_hard_backed_by`,
//               `_tappy_evidence_note`, `_tappy_budget_evidence`) and feeds the stream context.
//   not applicable  search_products (its own constraint validator, shoppingConstraints.ts),
//               transport / flights / weather / news / gold / web_search — a stated hard
//               constraint is LOGGED as `hard_not_applicable` with the tool name, never dropped.
//
// It reads the copy the MODEL reads (the wrapper runs after the tool's own trimming), so what it
// vouches for is exactly what the model can see (modelPayload keeps the fields it needs).

import { extractAttributes } from './reviewAttributes'
import { classifyHardGaps, evidenceNote, type HardGapReport } from './hardConstraints'
import { classifyShoppingGaps, shoppingEvidenceNote, type ShoppingConstraints } from './shoppingConstraints'
import type { SituationFrame } from './situationFrame'

/** The row arrays a place-shaped tool result can carry, in the order they are looked for. */
const ROW_KEYS = ['results', 'hotel_list'] as const
/** Tools whose rows are places — the only results a hard constraint about a place can be judged on. */
export const HARD_GATE_TOOLS = new Set(['search_places', 'get_hotel_prices'])
/**
 * B1 (2026-09-20): the PRODUCT unit is judged too — against the shopping constraints
 * (shoppingConstraints.ts: budget, brand, size / variant, in stock, recipient, unknown type), not
 * the place lexicon. Before this the gate logged `hard_not_applicable` for search_products, which
 * is why an S5b-class miss ("nước hoa … cho mẹ", no gap named) was invisible.
 */
export const SHOPPING_GATE_TOOLS = new Set(['search_products'])

export interface HardGateOutcome {
  applicable: boolean
  report: HardGapReport | null
  budgetGap: boolean
}

/** The entity-scoped text per venue: the row's own category words + entity-scoped snippets. */
export function entityTextsOf(result: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const r = (result ?? {}) as Record<string, unknown>
  for (const key of ROW_KEYS) {
    const rows = r[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = typeof row.name === 'string' ? row.name : ''
      if (!name) continue
      const cat = [name, row.type, row.amenity, row.cuisine, ...(Array.isArray(row.types) ? row.types : []), ...(Array.isArray(row.place_types) ? row.place_types : [])]
        .filter((x): x is string => typeof x === 'string' && x.length > 0).join(' · ')
      if (cat) out.set(name, [...(out.get(name) ?? []), cat])
    }
  }
  const snips = r.price_search_results
  if (!Array.isArray(snips)) return out
  for (const s of snips as Array<{ title?: string; snippet?: string; evidence_scope?: string; evidence_about?: string }>) {
    if (s.evidence_scope !== 'entity' || !s.evidence_about) continue
    const bucket = out.get(s.evidence_about) ?? []
    bucket.push(`${s.title ?? ''} ${s.snippet ?? ''}`)
    out.set(s.evidence_about, bucket)
  }
  return out
}

function rowsOf(result: Record<string, unknown>): unknown[] {
  for (const key of ROW_KEYS) if (Array.isArray(result[key])) return result[key] as unknown[]
  return []
}

/**
 * Judge every stated hard constraint (and the budget) against THIS tool result, annotate the
 * result for the model, and return what the stream guard needs. Mutates `result` in place when
 * applicable. Never throws: a failure is logged and the turn runs ungated but visibly.
 */
export function applyHardConstraintGate(
  toolName: string,
  result: unknown,
  situation: SituationFrame | null,
  lang: string,
  opts: { shopping?: ShoppingConstraints | null } = {},
): HardGateOutcome {
  const none: HardGateOutcome = { applicable: false, report: null, budgetGap: false }
  if (SHOPPING_GATE_TOOLS.has(toolName)) return applyShoppingGate(result, opts.shopping ?? null, lang)
  if (!situation) return none
  if (!HARD_GATE_TOOLS.has(toolName)) {
    if (situation.hard.length > 0 || situation.budget) {
      console.log(JSON.stringify({ type: 'tappyai_consultative_v1', step: 'hard_not_applicable', tool: toolName, hard: situation.hard, budget: !!situation.budget }))
    }
    return none
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return none
  const r = result as Record<string, unknown>
  try {
    const rows = rowsOf(r)
    const texts = entityTextsOf(r)
    const attrs = extractAttributes(texts)
    const report = classifyHardGaps(situation.hard, attrs, { rows, texts })
    if (report.gaps.length > 0) r._tappy_hard_gaps = report.gaps
    if (report.contrary.length > 0) r._tappy_hard_contrary = report.contrary
    if (report.rowBacked.length > 0) r._tappy_hard_backed_by = report.rowBackedBy
    const note = evidenceNote(report, lang)
    if (note) r._tappy_evidence_note = note
    const anyPrice = rows.some(row => {
      const x = row as Record<string, unknown>
      return !!(x.price_range_text || x.price_range || x.price_level || typeof x.price === 'number')
    })
    const budgetGap = !!situation.budget && !anyPrice
    if (budgetGap) r._tappy_budget_evidence = false
    console.log(JSON.stringify({
      type: 'tappyai_consultative_v1', step: 'attributes', tool: toolName, rows: rows.length, venues_with_attributes: attrs.size,
      hard: situation.hard, hard_gaps: report.gaps, hard_contrary: report.contrary, hard_assumed: report.assumed,
      hard_row_backed: report.rowBacked, hard_row_backed_by: report.rowBackedBy, hard_field_missing: report.fieldMissing,
      hard_unclassified: report.unclassified, budget_gap: budgetGap,
    }))
    return { applicable: true, report, budgetGap }
  } catch (e) {
    console.error('[consultative-v1] hard-constraint gate failed (turn runs ungated):', e)
    return none
  }
}

/** The product-unit gate (B1): the same annotations, the shopping vocabulary. */
function applyShoppingGate(result: unknown, k: ShoppingConstraints | null, lang: string): HardGateOutcome {
  const none: HardGateOutcome = { applicable: false, report: null, budgetGap: false }
  if (!k || !result || typeof result !== 'object' || Array.isArray(result)) return none
  const r = result as Record<string, unknown>
  try {
    const rows = (Array.isArray(r.search_results) ? r.search_results : Array.isArray(r.shopping_results) ? r.shopping_results : []) as Array<Record<string, unknown>>
    const { gaps, rowBackedBy } = classifyShoppingGaps(k, rows as Array<{ title?: string }>)
    const report: HardGapReport = { gaps: gaps as never, contrary: [], assumed: [], rowBacked: Object.keys(rowBackedBy) as never, rowBackedBy: rowBackedBy as never, fieldMissing: [], unclassified: [] }
    if (gaps.length > 0) r._tappy_hard_gaps = gaps
    if (Object.keys(rowBackedBy).length > 0) r._tappy_hard_backed_by = rowBackedBy
    const note = shoppingEvidenceNote(gaps, lang)
    if (note) r._tappy_evidence_note = note
    const anyPrice = rows.some(row => typeof row.price === 'number' || typeof row.price_vnd === 'number' || (typeof row.price === 'string' && /\d/.test(row.price)))
    const budgetGap = !!k.budget && !anyPrice
    if (budgetGap) r._tappy_budget_evidence = false
    if (k.unknownType && !k.productType) console.warn(JSON.stringify({ type: 'tappyai_shopping_constraints', step: 'unknown_product_type', text: k.unknownType.slice(0, 60) }))
    console.log(JSON.stringify({
      type: 'tappyai_consultative_v1', step: 'attributes', tool: 'search_products', rows: rows.length, venues_with_attributes: 0,
      hard: [k.brand && 'brand', k.size && 'size', k.variant && 'variant', k.inStock && 'in_stock', k.recipient && 'recipient', k.unknownType && 'unknown_type'].filter(Boolean),
      hard_gaps: gaps, hard_contrary: [], hard_assumed: [], hard_row_backed: Object.keys(rowBackedBy), hard_row_backed_by: rowBackedBy, hard_field_missing: [], hard_unclassified: [], budget_gap: budgetGap,
    }))
    return { applicable: true, report, budgetGap }
  } catch (e) {
    console.error('[consultative-v1] shopping gate failed (turn runs ungated):', e)
    return none
  }
}

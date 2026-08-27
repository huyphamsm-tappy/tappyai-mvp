import { normalizeShoppingRow, UNKNOWN, type Known, type NormalizedEvidence } from './normalizedEvidence'
import { groupIntoEntities, type Entity } from './entityModel'
import type { Candidate } from './candidate'
import type { Pick } from './pick'

// ── Universal Plan — Phase 4: SYNTHESIS / DECISION ──────────────────────────
//
// The step that turns clean evidence + entities/offers into a DECISION the model
// can explain, instead of a catalogue it dumps. It reuses the shipped pieces and
// invents no new decision logic:
//
//   · Phase 2 `normalizeShoppingRow` — RAW → CLEAN
//   · Phase 3 `groupIntoEntities`    — CLEAN → ENTITY/OFFERS (safe grouping)
//   · the existing `Pick`            — WHICH one, with grounded reasons + trade-off
//
// It produces a structured, grounded object; the model verbalises it. No second
// model call — this is dynamic prompt/tool-result content on the one AI.stream()
// the architecture lock allows, exactly like ADR-024's `_tappy_ranking`.
//
// TWO LAYERS, and the boundary between them is the whole point:
//   1. EDUCATION  — general product knowledge ("M1 has no 24GB config", "32GB
//      matters for dev work"). NOT a claim about a specific listing → the model
//      may give it from its own knowledge.
//   2. GROUNDED DECISION — every claim about a specific entity/offer (price,
//      seller, RAM, condition, rating) comes from HERE. Missing = UNKNOWN.

export type ConfigMatch = 'khop' | 'khac' | 'chua_ro'

export interface EntitySummary {
  config: string                 // "M1 · 32GB · 512GB · 14 inch" (+ condition if stated)
  offerCount: number
  priceLow: Known<number>
  priceHigh: Known<number>
  sellers: string[]
  recommended: boolean
  matchesRequest: ConfigMatch    // vs what the user asked for
}

export interface ShoppingSynthesis {
  v: 1
  requested: { model: Known<string>; ramGb: Known<number>; storageGb: Known<number> }
  entities: Entity[]
  recommendation: {
    entityKey: string | null
    seller: Known<string>
    reasons: { attribute: string; evidence: string }[]
    tradeOff: { attribute: string; evidence: string } | null
    conditional: boolean
  } | null
}

/** `Candidate.raw` is `unknown`; the normaliser wants a record. Coerce safely. */
function rowOf(c: Candidate): Record<string, unknown> {
  return c.raw && typeof c.raw === 'object' ? (c.raw as Record<string, unknown>) : {}
}

function priceRange(e: Entity): { low: Known<number>; high: Known<number> } {
  const prices = e.offers.map(o => o.price).filter((p): p is number => typeof p === 'number')
  if (prices.length === 0) return { low: UNKNOWN, high: UNKNOWN }
  return { low: Math.min(...prices), high: Math.max(...prices) }
}

/** How an entity's identity compares to the requested config. UNKNOWN never matches. */
function matchOf(reqModel: Known<string>, reqRam: Known<number>, reqStore: Known<number>, id: NormalizedEvidence['identity']): ConfigMatch {
  const pairs: [Known<string | number>, Known<string | number>][] = [
    [reqModel, id.model], [reqRam, id.ramGb], [reqStore, id.storageGb],
  ]
  let sawAsked = false
  let sawUnknown = false
  for (const [want, got] of pairs) {
    if (want === UNKNOWN) continue
    sawAsked = true
    if (got === UNKNOWN) { sawUnknown = true; continue }
    if (String(got).toLowerCase() !== String(want).toLowerCase()) return 'khac'
  }
  if (!sawAsked) return 'chua_ro'
  return sawUnknown ? 'chua_ro' : 'khop'
}

function configLabel(id: NormalizedEvidence['identity']): string {
  const parts: string[] = []
  parts.push(id.model === UNKNOWN ? 'chip ?' : String(id.model))
  parts.push(id.ramGb === UNKNOWN ? 'RAM ?' : `${id.ramGb}GB`)
  parts.push(id.storageGb === UNKNOWN ? 'storage ?' : `${id.storageGb}GB`)
  if (id.size !== UNKNOWN) parts.push(String(id.size))
  if (id.condition !== UNKNOWN) parts.push(String(id.condition))
  return parts.join(' · ')
}

/**
 * Build the grounded shopping decision from the shortlisted candidates and the Pick.
 *
 * Pure: no clock, no network, no randomness. The recommendation is exactly the
 * shipped `Pick` (rank[0]) mapped onto the entity it belongs to — no new choice.
 */
export function buildShoppingSynthesis(
  shortlisted: readonly Candidate[],
  pick: Pick | null,
  requestText: string,
): ShoppingSynthesis {
  const evidence = shortlisted.map(c => normalizeShoppingRow(rowOf(c), 'Google Shopping (Serper)'))
  const entities = groupIntoEntities(evidence)
  const req = normalizeShoppingRow({ title: requestText }).identity

  let recommendation: ShoppingSynthesis['recommendation'] = null
  if (pick) {
    const ent = entities.find(e => e.offers.some(o => o.evidence.raw === pick.candidate.raw)) ?? null
    recommendation = {
      entityKey: ent ? ent.entityKey : null,
      seller: normalizeShoppingRow(rowOf(pick.candidate)).offer.seller,
      reasons: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),
      tradeOff: pick.runnerUp?.leadsOn ? { attribute: pick.runnerUp.leadsOn.key, evidence: pick.runnerUp.leadsOn.detail } : null,
      conditional: pick.conditional,
    }
  }

  return {
    v: 1,
    requested: { model: req.model, ramGb: req.ramGb, storageGb: req.storageGb },
    entities,
    recommendation,
  }
}

/** The compact, model-facing view. Grounded numbers only; no raw rows. */
export function buildSynthesisPayload(s: ShoppingSynthesis): Record<string, unknown> {
  const summaries: EntitySummary[] = s.entities.map(e => {
    const { low, high } = priceRange(e)
    return {
      config: configLabel(e.identity),
      offerCount: e.offers.length,
      priceLow: low,
      priceHigh: high,
      sellers: e.offers.map(o => o.seller).filter((x): x is string => typeof x === 'string' && x !== UNKNOWN),
      recommended: !!s.recommendation && e.entityKey === s.recommendation.entityKey,
      matchesRequest: matchOf(s.requested.model, s.requested.ramGb, s.requested.storageGb, e.identity),
    }
  })
  return {
    ban_hoi: configLabel({ name: '', model: s.requested.model, ramGb: s.requested.ramGb, storageGb: s.requested.storageGb, size: UNKNOWN, condition: UNKNOWN }),
    nhom_san_pham: summaries,
    de_xuat: s.recommendation
      ? {
        noi_ban: s.recommendation.seller,
        ly_do: s.recommendation.reasons,
        danh_doi: s.recommendation.tradeOff,
        nghieng_ve: s.recommendation.conditional,
      }
      : null,
  }
}

/**
 * The two-layer instruction. Goes into `dynamic` on shopping turns only.
 *
 * Written in the unaccented Vietnamese the rest of the rulebook uses; the reply
 * is always fully accented.
 */
export function buildSynthesisInstructionBlock(): string {
  return `\n\n===== TU VAN MUA SAM: 2 TANG (GIAO DUC + QUYET DINH CO CAN CU) =====
Neu ket qua co truong \`_tappy_synthesis\`: do la cach he thong DA GOM cac tin dang thanh NHOM SAN PHAM (moi nhom = mot cau hinh), kem de xuat.

TANG 1 — GIAO DUC (kien thuc chung, DUOC PHEP tu hieu biet cua ban):
- Duoc giai thich khac biet cau hinh (vd "M1 khac M1 Pro", "M1 thuong khong co ban 24GB"), khuyen theo MUC DICH user, va nhac user nen kiem tra gi truoc khi mua.
- Day KHONG phai khang dinh ve mot tin dang cu the ⇒ duoc phep noi.

TANG 2 — QUYET DINH CO CAN CU (moi con so/thuoc tinh cua tin dang cu the phai tu \`_tappy_synthesis\` / \`_tappy_evidence\`):
- Gia, noi ban, RAM, dung luong, chip, tinh trang, danh gia: CHI lay tu du lieu. Thieu = KHONG CO DU LIEU, noi thang, khong bia.
- \`nhom_san_pham\`: moi phan tu la MOT cau hinh (khong phai mot tin dang). \`gia_thap\`/\`gia_cao\` la KHOANG GIA THAT tu cac noi ban trong nhom. \`matchesRequest\`: "khop" = dung cau hinh user hoi, "khac" = KHAC (phai noi ro), "chua_ro" = tieu de khong ghi du.
- Trinh bay theo NHOM, KHONG do tung tin dang. Neu co \`de_xuat\`: neu MOT de xuat ro rang + VI SAO (dung \`ly_do\`), kem DANH DOI neu \`danh_doi\` co, va nhac ngan cac nhom dang chu y khac. Neu \`nghieng_ve\` = true: dien dat co dieu kien, khong tuyet doi.
- KHONG trinh bay mot cau hinh KHAC nhu dung cai user hoi. KHONG gop cac nhom KHAC cau hinh lai voi nhau — he thong da gom an toan, ban KHONG duoc gom lai khac di.
- Muc tieu: mot QUYET DINH co the hanh dong duoc, khong phai danh sach. Ngan gon.
=====================================================`
}

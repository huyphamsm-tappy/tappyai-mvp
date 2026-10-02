import { normalizeShoppingRow, UNKNOWN, type Known, type NormalizedEvidence } from './normalizedEvidence'
import { groupIntoEntities, type Entity } from './entityModel'
import type { Candidate } from './candidate'
import type { Pick } from './pick'
import { requestedSpecs } from './shoppingConstraints'

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
  /** The listing's own title — what the reply should actually call this thing. */
  name: string
  config: string                 // "M1 · 32GB · 512GB · 14 inch" — only what was stated; the LABELLED, localized form is SynthesisEntityView.specs
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
    /** `params` rides along so a client can say the reason in its own language. */
    reasons: { attribute: string; evidence: string; params?: Record<string, string | number> }[]
    tradeOff: { attribute: string; evidence: string; params?: Record<string, string | number> } | null
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

/**
 * The configuration, as the listing stated it.
 *
 * 🚨 "chip ?" IS NOT A SPECIFICATION, AND IT WAS THE PRODUCT'S NAME ON SCREEN.
 * This used to emit a placeholder for every unknown field, so a Dell IdeaPad -
 * which states RAM and storage but no chip the Apple-silicon matcher knows -
 * rendered as "chip ? · 16GB · 512GB", and the card showed THAT as the product's
 * identity. Two defects in one string: a question mark presented as a fact, and a
 * config line standing in for a name.
 *
 * An unstated field is now simply absent, which is the same rule the rest of the
 * pipeline follows (rule 1: never invent a missing field). The identity itself
 * comes from the listing's own title - see `entityName`.
 */
function configLabel(id: NormalizedEvidence['identity']): string {
  const parts: string[] = []
  if (id.model !== UNKNOWN) parts.push(String(id.model))
  if (id.ramGb !== UNKNOWN) parts.push(`${id.ramGb}GB`)
  if (id.storageGb !== UNKNOWN) parts.push(`${id.storageGb}GB`)
  if (id.size !== UNKNOWN) parts.push(String(id.size))
  if (id.condition !== UNKNOWN) parts.push(String(id.condition))
  return parts.join(' · ')
}

/**
 * The product's own name: the title of the first offer in the group.
 *
 * Not derived, not shortened, not re-cased - the seller's listing title, which is
 * where the brand and the model number actually live ("Laptop Dell 15 DC15250").
 * A grouped entity's offers all share an identity key, so any of their titles
 * names the same product; the first is taken for determinism.
 */
export function entityName(e: Entity): string {
  for (const o of e.offers) {
    const n = o.evidence.identity.name
    if (typeof n === 'string' && n.trim()) return n.trim()
  }
  return ''
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
  const titleRead = normalizeShoppingRow({ title: requestText }).identity
  /**
   * What the user asked for, read as a SENTENCE as well as a title.
   *
   * 🚨 "16GB RAM 512GB" LOST ITS CAPACITY. `normalizeShoppingRow` parses a
   * LISTING, where a capacity carries a label or sits in a slash-separated block;
   * a person writes it bare. So a request that named a configuration outright
   * produced `ban_hoi: null` and every group scored "chua_ro" — the match verdict
   * was blank on exactly the turns where the user had been most specific.
   *
   * The title reading still wins where it found something; the sentence reader
   * only fills what it left UNKNOWN, so nothing that parses today changes.
   */
  const asked = requestedSpecs(requestText)
  const req = {
    ...titleRead,
    ramGb: titleRead.ramGb === UNKNOWN && asked.ramGb !== null ? asked.ramGb : titleRead.ramGb,
    storageGb: titleRead.storageGb === UNKNOWN && asked.storageGb !== null ? asked.storageGb : titleRead.storageGb,
  }

  let recommendation: ShoppingSynthesis['recommendation'] = null
  if (pick) {
    const ent = entities.find(e => e.offers.some(o => o.evidence.raw === pick.candidate.raw)) ?? null
    recommendation = {
      entityKey: ent ? ent.entityKey : null,
      seller: normalizeShoppingRow(rowOf(pick.candidate)).offer.seller,
      reasons: pick.reasons.filter(r => r.contribution > 0).slice(0, 3)
        .map(r => ({ attribute: r.key, evidence: r.detail, ...(r.params ? { params: r.params } : {}) })),
      tradeOff: pick.runnerUp?.leadsOn
        ? {
          attribute: pick.runnerUp.leadsOn.key,
          evidence: pick.runnerUp.leadsOn.detail,
          ...(pick.runnerUp.leadsOn.params ? { params: pick.runnerUp.leadsOn.params } : {}),
        }
        : null,
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
      name: entityName(e),
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
    ban_hoi: configLabel({ name: '', model: s.requested.model, ramGb: s.requested.ramGb, storageGb: s.requested.storageGb, size: UNKNOWN, condition: UNKNOWN }) || null,
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
- Neu KHONG co \`de_xuat\` (null): he thong DA xep hang nhung khong co phuong an nao vuot han. Noi ro rang co vai lua chon deu hop ly va trinh bay theo THU TU da xep, KHONG duoc tu chon mot cai va goi do la de xuat cua Tappy, KHONG bia ly do hay danh doi. Duoc phep hoi DUNG MOT cau ve tieu chu con thieu de lan sau chon duoc.
- The o duoi da co the hien du: ten san pham, gia, noi ban, danh gia, cau hinh va nut mua. KHONG liet ke lai cac con so do thanh danh sach trong phan chu; danh phan chu cho VI SAO, danh doi va dieu user nen can nhac.
- Neu ket qua co \`_tappy_constraint_unmet\`: KHONG CO san pham nao thoa man dieu kien user da noi ro (ngan sach / loai san pham / thuong hieu / cau hinh). NOI THANG dieu do bang mot cau, va DE NGHI noi dieu kien (vd nang ngan sach, doi cau hinh) de user tu quyet. TUYET DOI KHONG gioi thieu mot san pham vuot dieu kien nhu the no thoa man.
- KHONG khen chung chung khi khong co bang chung: 'rat dang mua', 'chat luong tot', 'hieu nang manh', 'pin tot', 'may nhe' chi duoc noi khi du lieu that su ghi. Neu khong co, bo han cau do.
- Muc tieu: mot QUYET DINH co the hanh dong duoc, khong phai danh sach. Ngan gon.
=====================================================`
}

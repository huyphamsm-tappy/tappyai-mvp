// ── PHASE A5.1 — the evidence-provenance boundary ────────────────────────────
//
// The live audit found the model stating a menu price ("~50.000 VND/tô") read
// straight out of a Serper snippet, phrased as though it were the restaurant's
// price. The number was not necessarily wrong — what was wrong is that a search
// snippet had become an authoritative FACT with nothing deterministic in between.
//
// This layer answers ONE question, deterministically, before synthesis:
//
//     for THIS value, from THIS source — what may be said?
//
// It does not rank, group, filter or decide. It CLASSIFIES; the shipped guards
// (moneyGuard / travelGuard / snippetPriceGuard) ENFORCE. Together: the guard
// removes a value that traces to no evidence; this tags how well a surviving
// value is supported, so the model reasons over graded evidence instead of a
// naked number. Reuses the existing UNKNOWN sentinel — no second absence model.

import { UNKNOWN, type Known } from './decisionEvidence'

export { UNKNOWN }

/** How well a dynamic value is supported. Ordered strongest → absent. */
export type EvidenceType =
  /** Structured, current, authoritative for this claim (a provider price/price_vnd). */
  | 'FACT'
  /** Review / search-snippet text supports it — state only with qualification. */
  | 'REVIEW_SUPPORTED'
  /** A reasonable inference (incl. a user's own number used for pricing) — must be qualified. */
  | 'INFERRED'
  /** No evidence — the value must not be stated. */
  | 'UNKNOWN'

/** Where a value came from. `user` is a CONSTRAINT source, never merchant evidence. */
export type EvidenceSource =
  | 'structured_provider'
  | 'review'
  | 'search_snippet'
  | 'user'
  | 'system'
  | 'none'

/**
 * The frozen policy matrix (Invariants A–D). Deterministic, source-driven:
 *  - a structured provider value is FACT;
 *  - a review or a search snippet is REVIEW_SUPPORTED, never FACT however confident the text;
 *  - a user's own number is INFERRED-for-pricing — a constraint, not a merchant price;
 *  - anything else is UNKNOWN.
 */
export function classifyEvidence(source: EvidenceSource): EvidenceType {
  switch (source) {
    case 'structured_provider': return 'FACT'
    case 'review': return 'REVIEW_SUPPORTED'
    case 'search_snippet': return 'REVIEW_SUPPORTED'
    case 'user': return 'INFERRED'
    case 'system': return 'INFERRED'
    default: return 'UNKNOWN'
  }
}

/** A dynamic value that carries its own provenance into the model-facing payload. */
export interface ProvenancedClaim<T = number> {
  /** The value, or the UNKNOWN sentinel when unsupported (Known<T> — one absence model). */
  value: Known<T>
  evidence_type: EvidenceType
  source_type: EvidenceSource
}

/** Only a FACT may be stated as a plain, unqualified fact. */
export function mayStateAsFact(claim: Pick<ProvenancedClaim, 'evidence_type'>): boolean {
  return claim.evidence_type === 'FACT'
}

/** A user's own number is a constraint (budget), never a merchant/product/fare price. */
export function isUserConstraint(source: EvidenceSource): boolean {
  return source === 'user'
}

/** Build a classified claim. A null/absent value is UNKNOWN — never reconstructed. */
export function provenancedClaim<T>(value: T | null | undefined, source: EvidenceSource): ProvenancedClaim<T> {
  if (value === null || value === undefined) {
    return { value: UNKNOWN, evidence_type: 'UNKNOWN', source_type: source }
  }
  return { value, evidence_type: classifyEvidence(source), source_type: source }
}

/**
 * The system-prompt block teaching the model to READ `evidence_type` and speak
 * within it. Advisory — the deterministic guards remain the boundary. Static
 * string (no interpolation) so it stays inside the cached shared prompt.
 */
export function renderEvidencePolicyBlock(): string {
  return [
    '===== DANH GIA BANG CHUNG (evidence provenance) - LUAT CUNG =====',
    "Mot so gia tri dong (gia, gio, tinh trang) kem 'evidence_type'. Noi DUNG trong pham vi bang chung:",
    '- FACT: gia/du lieu co cau truc, dang tin cay -> co the noi thang, chinh xac.',
    "- REVIEW_SUPPORTED: chi tu review/ket qua tim kiem (vd 'price_search_results') -> PHAI qualify",
    '  ("mot ket qua tim kiem hien thi khoang...", "gia tham khao"), TUYET DOI KHONG khang dinh la gia chinh xac.',
    '- INFERRED: suy luan (ke ca con so USER tu neu) -> noi ro la uoc doan/rang buoc, KHONG phai gia cua quan.',
    '- UNKNOWN: khong du bang chung -> KHONG noi con so, noi ro chua co du lieu; KHONG dung tu context khac.',
    'Bang chung yeu KHONG duoc trinh bay nhu FACT. So cua user la RANG BUOC, khong phai gia ban.',
    '================================================================',
  ].join('\n')
}

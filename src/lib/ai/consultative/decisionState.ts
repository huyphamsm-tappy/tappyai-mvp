// ── Phase 3A — decision-state types, constraint registry, wording lexicons, validation ──────────
//
// Additive companion of `needProfile.ts` (docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md 3A.1 / 3A.3 / 3A.5).
// Every field it adds to a NeedProfile is OPTIONAL and absent unless the user said something that populates it, so every
// existing consumer reads exactly what it read before. Nothing in here scores, ranks or weighs a candidate (that is 3B).
//
// All patterns run on `normalizeVN(text.toLowerCase())` output (lowercase, no diacritics).

/** Where a decision-state item came from. `user_text` = USER-STATED; `ai_validated` = proposed by the intent call and validated here;
 *  `memory` = a stored preference; `assumed` = nothing the user said (never hard). */
export type ProvenanceSource = 'user_text' | 'ai_validated' | 'memory' | 'assumed'

export interface Provenance {
  source: ProvenanceSource
  /** 1-based user turn that last set the item (0 = unknown). */
  turn: number
  /** The folded text span that carried it (absent for `memory` / `assumed`). */
  span?: string
}

export type ConstraintId = 'helmet_included' | 'spicy' | 'family_friendly' | 'vegetarian' | 'wifi' | 'outdoor'

export interface Constraint {
  id: ConstraintId
  kind: 'must_have' | 'avoid' | 'soft_pref'
  /** `stated` = the user's own words; `inferred` = derived by us and NEVER hard. */
  strength: 'stated' | 'inferred'
  /** A hard constraint eliminates only on CONTRADICTING supplied evidence — absence never does. */
  against?: 'contradiction'
  provenance: Provenance
}

export interface DecisionTradeoff {
  kind: 'balanced'
  /** ONLY the criteria the user stated. Nothing is added silently. */
  keys: string[]
  provenance: Provenance
}

export interface Household {
  kids?: boolean
  childAges?: number[]
  provenance: Provenance
}

export interface DismissedPriority {
  /** Canonical attribute key ("price", "rating", …) the user said does NOT matter. Never a positive weight. */
  key: string
  provenance: Provenance
}

// ── The registry: the one place that says which ids exist and how they are worded ────────────────

interface RegistryEntry {
  /** How a user names the thing. */
  alias: RegExp
  mustable: boolean
  avoidable: boolean
  /** The legacy `mustHave` / `avoid` key the ranker already understands, if any (else the id lives in `constraints[]` only). */
  legacyKey: string | null
}

export const CONSTRAINT_REGISTRY: Readonly<Record<ConstraintId, RegistryEntry>> = {
  helmet_included: { alias: /\bmu bao hiem\b|\bmu\b|\bhelmets?\b/, mustable: true, avoidable: false, legacyKey: null },
  spicy: { alias: /\bcay\b|\bspicy\b|\bdo cay\b/, mustable: false, avoidable: true, legacyKey: null },
  family_friendly: {
    alias: /(?:phu hop|thich hop|an toan|hop)\s*(?:cho\s*)?(?:be|em be|tre em|tre nho|con nit|tre|kids?|children|child|tre con)\b|family[- ]friendly|kid[- ]friendly|child[- ]friendly|(?:cho|voi)\s+(?:be|em be|tre em|tre nho|tre|con nit)\b/,
    mustable: true, avoidable: false, legacyKey: null,
  },
  vegetarian: { alias: /\bchay\b|\bvegetarian\b|\bvegan\b|\bthuan chay\b/, mustable: true, avoidable: false, legacyKey: 'vegetarian' },
  wifi: { alias: /\bwifi\b|\bwi-fi\b/, mustable: true, avoidable: false, legacyKey: 'wifi' },
  outdoor: { alias: /ngoai troi|\boutdoor\b|san vuon/, mustable: true, avoidable: false, legacyKey: 'outdoor' },
}

export const isConstraintId = (id: string): id is ConstraintId => Object.prototype.hasOwnProperty.call(CONSTRAINT_REGISTRY, id)

// ── Mandatory / non-negotiable wording (D8.b) ─────────────────────────────────────────────────────
// The owner's list (bắt buộc; phải có; không thể thiếu; nhất định phải; không chấp nhận nếu không) plus must-have / requirement
// language of equivalent meaning, matched on the folded text so unaccented typing reads the same. A negated marker
// ("không bắt buộc") is NOT mandatory.

const NOT_BEFORE = '(?<!\\bkhong\\s)(?<!\\bchua\\s)(?<!\\bchang\\s)(?<!\\bnot\\s)(?<!\\bno\\s)(?<!\\bnon\\s)'
const MANDATORY_CORE =
  'bat buoc|nhat dinh phai|nhat thiet phai|khong the thieu|phai co|dieu kien bat buoc|yeu cau bat buoc|' +
  'must have|must-have|must be|must|needs? to (?:be|have)|has to (?:be|have)|required|requirement|non-negotiable|mandatory|essential'
/** "cần có" is an existing must-have marker, but it is also everyday speech: household suitability needs the stronger forms. */
const MANDATORY_GENERAL = MANDATORY_CORE + '|can co'
/** The negated-acceptance forms: "không thể chọn chỗ không phù hợp cho bé", "không chấp nhận nếu không có mũ". */
const REFUSAL = 'khong the (?:chon|di|den|nhan)|khong chap nhan|khong duoc (?:chon|di|den)|khong dung|cannot (?:accept|choose)|can\'?t (?:accept|choose)|will not accept|won\'?t accept|not acceptable'

/** The reversed order — "a helmet is required", "mu la bat buoc" — with no negator in between ("helmet isn't required"). */
const REVERSED_MARKERS = 'bat buoc|required|mandatory|essential|non-negotiable|a must'
const NO_NEGATOR = "(?:(?!\\bkhong\\b|\\bchang\\b|\\bnot\\b|n't|\\bno\\b)[^.,;!?])"

function mandatoryRe(alias: RegExp, markers: string): RegExp {
  return new RegExp(`\\b${NOT_BEFORE}(?:${markers})[^.,;!?]{0,35}?(?:${alias.source})|(?:${alias.source})${NO_NEGATOR}{0,25}?\\b(?:${REVERSED_MARKERS})\\b`)
}
function refusalRe(alias: RegExp): RegExp {
  return new RegExp(`(?:${REFUSAL})[^.,;!?]{0,40}?\\b(?:neu\\s+)?khong\\s+(?:co\\s+)?(?:${alias.source})`)
}

/** The folded span in which the user made `id` mandatory, or null. */
export function mandatorySpanFor(id: ConstraintId, t: string): string | null {
  const e = CONSTRAINT_REGISTRY[id]
  if (!e.mustable) return null
  const markers = id === 'family_friendly' ? MANDATORY_CORE : MANDATORY_GENERAL
  return t.match(mandatoryRe(e.alias, markers))?.[0] ?? t.match(refusalRe(e.alias))?.[0] ?? null
}

/** Mandatory household wording — shared by the need profile and the situation frame so neither can disagree. */
export const hasMandatoryHousehold = (t: string): boolean => mandatorySpanFor('family_friendly', t) !== null

/** An avoidance ("không ăn cay", "tránh đồ cay", "no spicy"): the folded span, or null. */
export function avoidSpanFor(id: ConstraintId, t: string): string | null {
  const e = CONSTRAINT_REGISTRY[id]
  if (!e.avoidable) return null
  const re = new RegExp(`(?<!\\b(?:co|duoc)\\s)(?:khong an(?: duoc)?|khong the an|khong thich|khong chiu duoc|tranh|kieng|di ung|allergic to|don't eat|dont eat|can't eat|cannot eat|avoid|no|without)\\s+(?:[a-z]+\\s+){0,2}?(?:${e.alias.source})`)
  return t.match(re)?.[0] ?? null
}

// ── Household / child context (D8: context and a soft preference, never hard by itself) ───────────

const KIDS_CONTEXT =
  /\bvoi be\b|\bdi voi (?:con|be)\b|\bdat (?:con|be)\b|\bmang theo (?:con|be)\b|\bdan (?:con|be)\b|\bbe \d{1,2} ?tuoi\b|\bcon \d{1,2} ?tuoi\b|\bcho be\b|\bcho tre\b|\bem be\b|\btre em\b|\btre nho\b|\bcon nit\b|\bcon nho\b|\bwith (?:a |my )?(?:kid|kids|child|children|baby|toddler)\b|\bmy (?:kid|kids|child|children)\b|\bkids?\b|\bchildren\b|\bdi cung (?:con|be)\b|\bcung (?:con|be)\b|\bco (?:con|be|tre)\b(?! (?:gai|trai))/

export function householdIn(t: string): { kids: true; childAges: number[]; span: string } | null {
  const m = t.match(KIDS_CONTEXT)
  if (!m) return null
  const ages: number[] = []
  for (const a of t.matchAll(/\b(?:be|con|tre|em be|kid|child)\s*(\d{1,2}) ?(?:tuoi|years? old|yo)\b/g)) {
    const n = Number(a[1])
    if (n >= 0 && n <= 17 && !ages.includes(n)) ages.push(n)
  }
  return { kids: true, childAges: ages, span: m[0] }
}

// ── Validation / normalisation (3A.3) ──────────────────────────────────────────────────────────────

export interface DecisionStateShape {
  priorities: Array<{ key: string; weight: number; source: string }>
  constraints?: Constraint[]
  dismissed?: DismissedPriority[]
  tradeoff?: DecisionTradeoff
  household?: Household
  conflicts?: string[]
}

/**
 * Deterministic validation of the structured decision state, applied to rule-extracted AND (if 3A.2 is ever opened) AI-proposed items:
 *  - an id outside the registry is dropped, never guessed;
 *  - an item with no provenance is `assumed`, and an `assumed` / `inferred` item can never be hard (it is downgraded to a soft preference);
 *  - a `must_have` / `avoid` on an id the registry does not allow for that kind is dropped;
 *  - a dismissed key can never also be a positive priority (the dismissal wins; the conflict is recorded);
 *  - duplicate constraints collapse to the most recent turn;
 *  - tradeoff keys are unique and non-empty.
 * Mutates `state` in place and returns the list of what was dropped / downgraded (for logging and tests), so the state itself carries no extra field.
 */
export function validateDecisionState(state: DecisionStateShape): string[] {
  const dropped: string[] = []

  if (state.constraints) {
    const out = new Map<string, Constraint>()
    for (const c of state.constraints) {
      if (!isConstraintId(String(c.id))) { dropped.push(`unknown_constraint:${String(c.id)}`); continue }
      const e = CONSTRAINT_REGISTRY[c.id]
      let next: Constraint = { ...c }
      if (!next.provenance) next.provenance = { source: 'assumed', turn: 0 }
      const hardKind = next.kind === 'must_have' || next.kind === 'avoid'
      if (hardKind && ((next.kind === 'must_have' && !e.mustable) || (next.kind === 'avoid' && !e.avoidable))) {
        dropped.push(`kind_not_allowed:${next.id}:${next.kind}`); continue
      }
      if (hardKind && (next.strength !== 'stated' || next.provenance.source === 'assumed')) {
        // Never silently coerce a weaker signal into a stronger constraint: it stays, softly.
        next = { ...next, kind: 'soft_pref', strength: 'inferred' }
        delete next.against
        dropped.push(`downgraded_to_soft:${next.id}`)
      }
      const key = `${next.id}:${next.kind}`
      const prev = out.get(key)
      if (!prev || next.provenance.turn >= prev.provenance.turn) out.set(key, next)
    }
    state.constraints = [...out.values()]
    if (state.constraints.length === 0) delete state.constraints
  }

  if (state.dismissed) {
    const seen = new Map<string, DismissedPriority>()
    for (const d of state.dismissed) {
      if (!d || !d.key) { dropped.push('dismissed_without_key'); continue }
      const prev = seen.get(d.key)
      if (!prev || d.provenance.turn >= prev.provenance.turn) seen.set(d.key, d)
    }
    state.dismissed = [...seen.values()]
    for (const d of state.dismissed) {
      const i = state.priorities.findIndex(p => p.key === d.key)
      if (i >= 0) {
        state.priorities.splice(i, 1)
        state.conflicts = [...new Set([...(state.conflicts ?? []), d.key])]
        dropped.push(`dismissed_overrides_priority:${d.key}`)
      }
    }
    if (state.dismissed.length === 0) delete state.dismissed
  }

  if (state.tradeoff) {
    const keys = [...new Set(state.tradeoff.keys.filter(k => typeof k === 'string' && k.trim()))]
    if (keys.length === 0) { delete state.tradeoff; dropped.push('tradeoff_without_keys') } else state.tradeoff = { ...state.tradeoff, keys }
  }

  return dropped
}

/**
 * An EXPLICIT stated priority (Phase 3A sufficiency / Phase 3B places mode): a balance statement, or a stated / comparative priority of
 * weight >= 2 ("uu tien X", "X quan trong", a comparative winner). A bare descriptive mention (weight 1), a damped comparative loser (0.5),
 * a stored preference and a DISMISSED priority (it lives in `dismissed`, never in `priorities`) do not count.
 */
export function hasExplicitPriorityState(need: { tradeoff?: unknown; priorities: ReadonlyArray<{ weight: number; source: string }> }): boolean {
  return !!need.tradeoff || need.priorities.some(p => p.source !== 'preference' && p.weight >= 2)
}

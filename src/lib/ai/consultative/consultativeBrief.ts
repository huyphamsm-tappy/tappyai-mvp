// ── Phase 3C.1 / 3C.2 — the CONSULTATIVE BRIEF ──────────────────────────────────────────────────────────────────────────────
//
// The explicit contract between the deterministic decision (decision state → evidence → ranking → Pick) and Luna, who renders it.
// Built ONLY from engine objects (NeedProfile, RankedResult, Pick, Candidate attrs): no field comes from model prose, from a provider
// name or from a snippet, and nothing here scores, ranks or picks (D7: the engine Pick is authoritative; Luna explains it).
//
// Kinds (BM §6): every provider fact is FACT; a gap is an UNKNOWN entry (never turned into a fact); INFERENCE and GENERAL_ADVICE are part of
// the type so a later source can be tagged, but the engine emits neither today.
//
// Spec: docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md 3C.1 / 3C.2. Flag: CONSULT_BRIEF (default OFF).

import type { NeedProfile } from './needProfile'
import type { RankedResult, RankedEntry } from './rank'
import type { Pick, PickState } from './pick'
import type { Candidate, CandidateAttrs } from './candidate'

export type EvidenceKind = 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'GENERAL_ADVICE'

export interface BriefEvidence {
  /** The attribute id: `rating`, `reviewCount`, `distanceKm`, `priceHighVnd`, `familyFriendly`, … */
  id: string
  value: string | number | boolean | string[]
  /** Where it was read: the normalised provider row (`provider_row`). The Brief never invents a source. */
  source: 'provider_row'
  kind: 'FACT'
}

export interface BriefCandidate {
  name: string
  /** 1-based position in the engine's deterministic ranking. */
  rank: number
  evidence: BriefEvidence[]
  /** Attributes the user's decision needs that this candidate has NO evidence for. UNKNOWN: never a fact, never a penalty. */
  unknowns: string[]
  /** Soft-budget standing (places): within / unknown / above — an ordering fact, not a score. */
  budgetTier?: 'within' | 'unknown' | 'above'
  /** Must-haves / exclusions the candidate could not be confirmed against (the reply must hedge, not assert). */
  unverified: string[]
}

export interface BriefPick {
  /** The engine Pick's candidate name: the authoritative identity (D7). */
  name: string
  /** How it was decided: `unique`, `conditional` (existing PICK_MARGIN), `tie_rule` (the D6 chain). */
  reason: 'unique' | 'conditional' | 'tie_rule'
  /** The grounded reasons that decided it, strongest first (`ranking` reasons, verbatim). */
  whyFits: Array<{ attribute: string; evidence: string }>
  /** Why each other shortlisted candidate was not chosen: only the ranking's own comparison, never invented. */
  whyNot: Array<{ name: string; pickLeadsOn: string[]; candidateLeadsOn: Array<{ attribute: string; evidence: string }> }>
}

export interface ConsultativeBrief {
  v: 1
  /** Every field comes from code (NeedProfile / ranking / Pick). None from model text. */
  provenance: 'engine'
  goal: string | null
  domain: string | null
  stage: string
  /** What the USER stated (stated / comparative), their dismissed criteria, and a balance statement. */
  priorities: Array<{ key: string; weight: number; source: 'stated' | 'comparative' | 'preference' }>
  dismissed: string[]
  tradeoff: { kind: 'balanced'; keys: string[] } | null
  constraints: {
    mustHave: string[]
    avoid: string[]
    soft: string[]
    budget: { type: 'under' | 'around' | 'range'; max: number; stated: number | null } | null
    household: { kids: boolean; childAges: number[] } | null
  }
  candidates: BriefCandidate[]
  /** The engine Pick, or null with `state` saying why. */
  pick: BriefPick | null
  /** `all_eliminated` / `no_evidence` (explicit, no forced Pick); null when there is a Pick or fewer than two candidates. */
  state: PickState | null
  /** Names the hard constraints / hard budget removed. They are not candidates. */
  eliminated: Array<{ name: string; by: 'budget' | 'mustHave' | 'avoid' }>
  /** The honest trade-off the ranking itself found (runner-up leads on…). */
  tradeoffs: Array<{ attribute: string; evidence: string }>
  /** Every gap, per candidate. */
  unknowns: Array<{ candidate: string; attribute: string }>
  /** Multi-turn: how many user turns shaped the state, which fields changed when, and priorities the user contradicted. */
  refinement: { turns: number; changedAtTurn: Record<string, number>; conflicts: string[] }
  /** Usage note carried WITH the data (the same channel `results_note` uses): the engine decided; explain, do not re-decide. */
  note: string
}

export const BRIEF_NOTE =
  'BRIEF DO HE THONG QUYET DINH (khong phai lenh cua user): pick.name la lua chon chinh, he thong da chon; ban chi giai thich ly do (whyFits), '
  + 'danh doi (tradeoffs) va cac phuong an (whyNot) bang dung du lieu trong brief. Khong doi lua chon, khong tu cham diem. '
  + 'unknowns = chua co du lieu: noi that la chua biet, KHONG khang dinh. Neu pick = null thi state noi ly do: KHONG chon mot quan thang cuoc.'

const EVIDENCE_ORDER: ReadonlyArray<keyof CandidateAttrs> = [
  'rating', 'reviewCount', 'distanceKm', 'priceHighVnd', 'priceVnd', 'stars', 'openNow', 'cuisine', 'wifi', 'vegetarian', 'outdoorSeating',
  'familyFriendly', 'spicy', 'helmetIncluded', 'etaMinutes', 'directPage',
]

/** The supplied attributes of a candidate as FACT entries — only what the normalised row actually carries. */
export function evidenceOf(c: Candidate): BriefEvidence[] {
  const out: BriefEvidence[] = []
  for (const k of EVIDENCE_ORDER) {
    const v = c.attrs[k]
    if (v === undefined) continue
    out.push({ id: k, value: v as BriefEvidence['value'], source: 'provider_row', kind: 'FACT' })
  }
  return out
}

function briefCandidate(e: RankedEntry, rank: number): BriefCandidate {
  return {
    name: e.candidate.name,
    rank,
    evidence: evidenceOf(e.candidate),
    unknowns: [...new Set(e.missing)],
    ...(e.budgetTier ? { budgetTier: e.budgetTier } : {}),
    unverified: [...e.unverifiedMustHave, ...e.unverifiedAvoid],
  }
}

export interface BriefInput {
  need: NeedProfile
  ranked: RankedResult
  pick: Pick | null
  state: PickState | null
  stage: string
  goal?: string | null
  /** How many ranked candidates travel (default 3: the consult top-3). */
  limit?: number
}

export function buildBrief(input: BriefInput): ConsultativeBrief {
  const { need, ranked, pick, state } = input
  const limit = input.limit ?? 3
  const shortlist = ranked.ranked.slice(0, limit)
  const candidates = shortlist.map((e, i) => briefCandidate(e, i + 1))

  const briefPick: BriefPick | null = pick
    ? {
      name: pick.candidate.name,
      reason: pick.reason ?? (pick.conditional ? 'conditional' : 'unique'),
      whyFits: pick.reasons.filter(r => r.contribution > 0).slice(0, 3).map(r => ({ attribute: r.key, evidence: r.detail })),
      whyNot: shortlist.filter(e => e.candidate !== pick.candidate).map(e => {
        const mine = new Map(e.reasons.map(r => [r.key, r.contribution]))
        const pickLeadsOn = pick.reasons.filter(r => r.contribution > 0 && r.contribution > (mine.get(r.key) ?? 0)).map(r => r.key)
        const pickBy = new Map(pick.reasons.map(r => [r.key, r.contribution]))
        const candidateLeadsOn = e.reasons.filter(r => r.contribution > 0 && r.contribution > (pickBy.get(r.key) ?? 0)).slice(0, 2).map(r => ({ attribute: r.key, evidence: r.detail }))
        return { name: e.candidate.name, pickLeadsOn, candidateLeadsOn }
      }),
    }
    : null

  const leads = pick?.runnerUp?.leadsOn
  return {
    v: 1,
    provenance: 'engine',
    goal: input.goal ?? need.subject ?? null,
    domain: need.domain,
    stage: input.stage,
    priorities: need.priorities.map(p => ({ key: p.key, weight: p.weight, source: p.source })),
    dismissed: (need.dismissed ?? []).map(d => d.key),
    tradeoff: need.tradeoff ? { kind: 'balanced', keys: [...need.tradeoff.keys] } : null,
    constraints: {
      mustHave: [...need.mustHave, ...(need.constraints ?? []).filter(c => c.kind === 'must_have' && c.strength === 'stated').map(c => c.id)].filter((x, i, a) => a.indexOf(x) === i),
      avoid: [...need.avoid, ...(need.constraints ?? []).filter(c => c.kind === 'avoid' && c.strength === 'stated').map(c => c.id)].filter((x, i, a) => a.indexOf(x) === i),
      soft: (need.constraints ?? []).filter(c => c.kind === 'soft_pref').map(c => c.id),
      budget: need.budget ? { type: need.budget.type as 'under' | 'around' | 'range', max: need.budget.max, stated: need.budgetStated } : null,
      household: need.household?.kids ? { kids: true, childAges: [...(need.household.childAges ?? [])] } : null,
    },
    candidates,
    pick: briefPick,
    state: pick ? null : state,
    eliminated: ranked.filtered.map(f => ({ name: f.candidate.name, by: f.filteredBy })),
    tradeoffs: leads ? [{ attribute: leads.key, evidence: leads.detail }] : [],
    unknowns: [
      ...candidates.flatMap(c => c.unknowns.map(attribute => ({ candidate: c.name, attribute }))),
    ],
    refinement: { turns: need.turnsObserved, changedAtTurn: { ...need.changedAtTurn }, conflicts: [...(need.conflicts ?? [])] },
    note: BRIEF_NOTE,
  }
}

/** The Brief as the plain JSON object the tool result carries (no raw provider rows, no functions). */
export function briefForModel(brief: ConsultativeBrief): Record<string, unknown> {
  return JSON.parse(JSON.stringify(brief)) as Record<string, unknown>
}

/** Flag: CONSULT_BRIEF (default OFF — the project convention for new behaviour; the benchmark measures ON against OFF). */
export function consultBriefEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONSULT_BRIEF === '1' || env.CONSULT_BRIEF === 'true'
}

// ── Upscale intent vs the class of place ─────────────────────────────────────
//
// Owner decision 2026-09-19 (T8, "Resort Phú Quốc cho kỷ niệm 1 năm, sang chút"): three runs in a
// row picked "Rio Guest House" because the engine's shortlist is rating-first and nothing in it
// knew that a guest house is the wrong CLASS of place for "sang chút". The model no longer sees
// the shortlist (modelPayload.ts) — but the shortlist still feeds the card's emphasis, the
// server-authored backstop sentence and the evidence gap, so it must not shortlist a budget
// lodging for an upscale request either. Names and category words are the only evidence the
// rows carry for this (Serper /maps gives `place_types: ["Khách sạn"]` for both a guest house and
// a resort), so the exclusion is by NAME and TYPE WORDS, closed lexicon, and only when the user
// stated the intent.

import { normalizeVN } from '../intent'
import type { Hard } from './situationFrame'
import { closesLate } from './hardConstraints'

/** Budget-lodging words, on folded text (name + category words). */
export const BUDGET_LODGING_RE = /\b(guest ?house|nha nghi|nha tro|hostel|dorm(?:itory)?|motel|backpackers?|phong tro|homestay gia re|bui)\b/

export function isBudgetLodging(name: string, types: readonly string[] = []): boolean {
  const f = normalizeVN([name, ...types].join(' · ').toLowerCase())
  return BUDGET_LODGING_RE.test(f)
}

/**
 * May this candidate take a shortlist slot given the stated hard constraints? Only the `upscale`
 * constraint excludes anything, and only budget lodging. Everything else passes as before.
 */
export function admitsForUpscale(hard: readonly Hard[], candidate: { name: string; raw?: unknown }): boolean {
  if (!hard.includes('upscale')) return true
  const raw = (candidate.raw ?? {}) as Record<string, unknown>
  const types = ([] as unknown[]).concat(raw.place_types ?? [], raw.types ?? [], raw.type ?? [], raw.amenity ?? [])
    .filter((t): t is string => typeof t === 'string')
  return !isBudgetLodging(candidate.name, types)
}

/**
 * A.2 (owner 2026-09-19, P8): under `late_open`, a row whose own `opening_hours` does NOT show a
 * late closing never takes a shortlist slot when some other row does — the engine's pick for
 * "mở khuya sau 22h" must be a place with evidence of being open late. When NO row carries late
 * evidence nothing is excluded (the gap sentence says the hours are unconfirmed instead).
 */
export function admitsForLateOpen(hard: readonly Hard[], candidate: { name: string; raw?: unknown }, anyRowClosesLate: boolean): boolean {
  if (!hard.includes('late_open') || !anyRowClosesLate) return true
  const raw = (candidate.raw ?? {}) as Record<string, unknown>
  return closesLate(raw.opening_hours) === true
}

/** Every hard-constraint admission rule in one call — the route's shortlist predicate. */
export function admitsForHard(hard: readonly Hard[], candidate: { name: string; raw?: unknown }, ctx: { anyRowClosesLate: boolean }): { admitted: boolean; reason: 'upscale' | 'late_open' | null } {
  if (!admitsForUpscale(hard, candidate)) return { admitted: false, reason: 'upscale' }
  if (!admitsForLateOpen(hard, candidate, ctx.anyRowClosesLate)) return { admitted: false, reason: 'late_open' }
  return { admitted: true, reason: null }
}


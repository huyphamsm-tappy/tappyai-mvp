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

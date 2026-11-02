import { normalizeVN } from '../intent'
import type { Candidate } from './candidate'

// ── The place a card shows must BE the kind of place that was asked for ─────────────────────────────────────────────
//
// Owner UAT 2026-10-01 (ca c): «Tìm quận 3 á» while looking for karaoke — the text said "chưa xác nhận được quán karaoke ở
// Quận 3" while the card row showed the Geological Museum. Ranking answers "which of these fits best"; it cannot say "this is
// not the thing you asked for". Same class as the accessory gate in shoppingConstraints.ts (a phone shown for a screen
// protector). Only activities with an unambiguous venue noun are gated; for the rest the gate says nothing (null).
//
// Evidence = the row's OWN words: name + provider category/types. Silence is not a mismatch ONLY when the row carries no
// category at all AND its name says nothing — then it is judged by the name alone, so an unnamed-type venue called
// «Karaoke Mei» passes and «Bảo tàng Địa chất» does not.

const GATES: ReadonlyArray<readonly [activity: RegExp, venue: RegExp]> = [
  [/^karaoke$/, /\b(karaoke|ktv|music box|hat cho nhau|quan hat)\b/],
  [/^bida$/, /\b(bida|billiard|billiards|pool|bi a)\b/],
  [/^bowling$/, /\bbowling\b/],
  [/^xem phim$/, /\b(cinema|cinemas|rap chieu|rap phim|cgv|galaxy|lotte cinema|bhd|beta cinemas|cinestar|mega gs|dcine|movie theat)/],
  [/^escape room$/, /\b(escape|thoat hiem|mat that|room)\b/],
  [/^thuy cung$/, /\b(thuy cung|aquarium|ocean|sea life)\b/],
  [/bao tang/, /\b(bao tang|museum|trien lam|gallery|nghe thuat|di tich)\b/],
]

const text = (c: Candidate): string => {
  const r = (c.raw ?? {}) as Record<string, unknown>
  const types = Array.isArray(r.place_types) ? r.place_types.join(' ') : ''
  return normalizeVN([c.name, types, r.type, r.category, r.amenity, r.leisure].filter((x): x is string => typeof x === 'string').join(' ').toLowerCase())
}

/** null = this activity is not gated (no unambiguous venue noun). */
export function venueNounFor(activity: string | undefined | null): RegExp | null {
  const a = normalizeVN((activity ?? '').toLowerCase()).trim()
  if (!a) return null
  return GATES.find(([act]) => act.test(a))?.[1] ?? null
}

export interface PlaceGateResult { kept: Candidate[]; rejected: Candidate[]; gated: boolean }

/**
 * `searchText` = the query actually sent to the provider. The gate applies only when that search is FOR this activity
 * («karaoke quận 3»): a food search in the same thread («ăn tối rồi đi hát») must not be judged by the karaoke noun.
 */
export function gatePlacesByActivity(activity: string | undefined | null, candidates: readonly Candidate[], searchText: string): PlaceGateResult {
  const venue = venueNounFor(activity)
  if (!venue || !venue.test(normalizeVN(searchText.toLowerCase()))) return { kept: [...candidates], rejected: [], gated: false }
  const kept: Candidate[] = [], rejected: Candidate[] = []
  for (const c of candidates) (venue.test(text(c)) ? kept : rejected).push(c)
  return { kept, rejected, gated: true }
}

// ── A travel agency / tour company is not a place to go (owner UAT 2026-10-01, ca e) ───────────────────────────────────
// «📸 Hình ảnh & link review: tour quy nhơn 3 ngày 2 đêm» was a tour company's Maps listing: its owner-uploaded photo is an
// ADVERT (banner with a phone number), and it was shown as if it were a place in the plan. Such a row never becomes a card
// or a photo unless the user asked for a tour or an agency.
const AGENCY = /\b(?:cong ty du lich|cong ty lu hanh|travel agency|tour operator|tour company|dai ly (?:ve|du lich|lu hanh)|lu hanh|tour)\b/
const WANTS_TOUR = /\b(?:tour|dat tour|cong ty du lich|dai ly|travel agency|lu hanh)\b/

export function isTravelAgency(c: Candidate): boolean { return AGENCY.test(text(c)) }

/** Drops agency rows unless the search itself is for a tour/agency. Returns the rows to remove. */
export function agencyRowsToDrop(candidates: readonly Candidate[], searchText: string): Candidate[] {
  if (WANTS_TOUR.test(normalizeVN((searchText || '').toLowerCase()))) return []
  return candidates.filter(isTravelAgency)
}

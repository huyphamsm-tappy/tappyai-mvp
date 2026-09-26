// ── get_flight_prices `passengers`: the per-booking cap, applied with a message ──────────────
//
// The provider side: fares (Travelpayouts) are per person and take no passenger count; the dated
// booking links (Trip.com `quantity`, Traveloka `ps=`) carry it. The real limit is the industry
// one — "most airlines define a group booking as 10+ passengers" (Trip.com group-travel guide,
// read 2026-09-19); Traveloka's help centre states no number. So an individual booking is at most
// 9, and a bigger party needs split tickets or a group desk. The schema used to say `.max(9)`,
// which the AI SDK enforced BEFORE execute() — a party of ten ended the whole turn. Now the
// value is clamped here and the reply is told why, in the result and in the log.

export const MAX_PASSENGERS_PER_BOOKING = 9

export function clampPassengers(raw: unknown, lang: string): { passengers: number | undefined; note: string | null } {
  if (raw === undefined || raw === null || raw === '') return { passengers: undefined, note: null }
  const digits = String(raw).replace(/[^\d.]/g, '')
  const n = typeof raw === 'number' ? raw : digits ? Number(digits) : NaN
  if (!Number.isFinite(n)) {
    return { passengers: undefined, note: lang === 'en' ? `Passenger count "${String(raw).slice(0, 20)}" was not understood; links assume 1 adult.` : `Khong hieu so hanh khach "${String(raw).slice(0, 20)}"; link dat ve mac dinh 1 nguoi lon.` }
  }
  const whole = Math.round(n)
  if (whole < 1) return { passengers: 1, note: lang === 'en' ? 'Passenger count below 1 was treated as 1 adult.' : 'So hanh khach nho hon 1 duoc tinh la 1 nguoi lon.' }
  if (whole > MAX_PASSENGERS_PER_BOOKING) {
    return {
      passengers: MAX_PASSENGERS_PER_BOOKING,
      note: lang === 'en'
        ? `A single booking holds at most ${MAX_PASSENGERS_PER_BOOKING} passengers; ${whole} people need split bookings or the airline's group desk (10+). Links are for ${MAX_PASSENGERS_PER_BOOKING}. Tell the user this.`
        : `Mot ve le toi da ${MAX_PASSENGERS_PER_BOOKING} hanh khach; nhom ${whole} nguoi can tach ve hoac dat ve doan (tu 10 nguoi). Link dat ve dang cho ${MAX_PASSENGERS_PER_BOOKING} nguoi. Noi ro dieu nay voi user.`,
    }
  }
  return { passengers: whole, note: whole !== n ? (lang === 'en' ? `Passenger count ${n} rounded to ${whole}.` : `So hanh khach ${n} duoc lam tron thanh ${whole}.`) : null }
}

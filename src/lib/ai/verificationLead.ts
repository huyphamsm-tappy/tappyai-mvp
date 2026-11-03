// ── Verified vs unverified: the system's own sentence for flight / cinema facts no approved source returns ───────────────────
//
// Phase 7 closeout 2B/2C. Audit (docs/audit/PHASE7-CLOSEOUT.md §Data sources): no approved Tappy source returns a flight FARE for a
// date, a flight SCHEDULE, a live flight STATUS, a cinema SHOWTIME per cinema/date or a cinema TICKET PRICE. The tools therefore
// return those fields as not verified, and the reply must say so for exactly the dimension the user asked about — never imply it.
// This is deterministic (the user's own words decide the dimension), so it does not depend on how the model phrased its answer:
// a reply that already says that dimension is "chưa xác minh" is left as written; otherwise the owner's sentence leads.

export type UnverifiedDimension = 'fare' | 'schedule' | 'status' | 'showtime' | 'ticket'

export const UNVERIFIED_SENTENCE_VI: Record<UnverifiedDimension, string> = {
  fare: 'Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có.',
  schedule: 'Giờ bay / chuyến bay hiện chưa xác minh được từ nguồn dữ liệu đang có.',
  status: 'Trạng thái chuyến bay hiện chưa xác minh được từ nguồn dữ liệu đang có.',
  showtime: 'Suất chiếu hiện chưa xác minh được từ nguồn dữ liệu đang có.',
  ticket: 'Giá vé xem phim hiện chưa xác minh được từ nguồn dữ liệu đang có.',
}
const UNVERIFIED_SENTENCE_EN: Record<UnverifiedDimension, string> = {
  fare: 'The fare could not be verified from the available data sources.',
  schedule: 'Flight times could not be verified from the available data sources.',
  status: 'The flight status could not be verified from the available data sources.',
  showtime: 'Showtimes could not be verified from the available data sources.',
  ticket: 'The ticket price could not be verified from the available data sources.',
}

/** What the user asked about, by their own words. Flight: status > schedule > fare (default fare). Cinema: showtime and/or ticket price. */
export function askedDimensions(userText: string, kind: 'flight' | 'movie'): UnverifiedDimension[] {
  const t = userText.normalize('NFC').toLowerCase()
  if (kind === 'flight') {
    if (/đúng giờ|trễ|delay|hoãn|huỷ|hủy|cất cánh|hạ cánh|tình trạng|trạng thái|on time|status|cancel/.test(t)) return ['status']
    if (/chuyến (?:sáng|trưa|chiều|tối|đêm|sớm|muộn)|mấy giờ|giờ bay|giờ cất|có chuyến|lịch bay|khung giờ|morning|evening|schedule|what time/.test(t)) return ['schedule']
    return ['fare']
  }
  const out: UnverifiedDimension[] = []
  if (/suất|mấy giờ|giờ chiếu|lịch chiếu|\b\d{1,2}\s*(?:h|giờ|:\d{2})\b|showtime|what time/.test(t)) out.push('showtime')
  if (/giá|bao nhiêu|nhiêu (?:1|một) vé|price|how much/.test(t)) out.push('ticket')
  return out
}

/** The reply already says this dimension is unverified (its own words). */
function alreadySaid(prose: string, d: UnverifiedDimension, lang: string): boolean {
  if (lang !== 'vi') return /not (?:been )?verified|unverified|could not be verified/i.test(prose)
  // Regex LITERALS on purpose (a template-string RegExp broke in the production bundle). A dot followed by a non-space
  // ("TP.HCM", "05.10") is not a sentence end.
  const said: Record<UnverifiedDimension, RegExp> = {
    fare: /giá(?:\s+vé)?(?:[^.!?\n]|\.(?=\S)){0,60}chưa\s+(?:được\s+)?xác\s+minh/i,
    schedule: /(?:giờ bay|giờ cất cánh|chuyến bay|lịch bay|chuyến)(?:[^.!?\n]|\.(?=\S)){0,60}chưa\s+(?:được\s+)?xác\s+minh/i,
    status: /(?:trạng thái|tình trạng)(?:[^.!?\n]|\.(?=\S)){0,60}chưa\s+(?:được\s+)?xác\s+minh/i,
    showtime: /(?:suất(?: chiếu)?|giờ chiếu|lịch chiếu)(?:[^.!?\n]|\.(?=\S)){0,60}chưa\s+(?:được\s+)?xác\s+minh/i,
    ticket: /giá(?:\s+vé)?(?:[^.!?\n]|\.(?=\S)){0,60}chưa\s+(?:được\s+)?xác\s+minh/i,
  }
  return said[d].test(prose)
}

/**
 * The sentence(s) that lead the reply, or ''. `flight` = a flight result this turn was not verified (booking hand-off only);
 * `movie` = a film result this turn carried no showtime / ticket-price source.
 */
export function verificationLead(o: { flight: boolean; movie: boolean; userText: string; prose: string; lang: string }): string {
  const dims: UnverifiedDimension[] = [
    ...(o.flight ? askedDimensions(o.userText, 'flight') : []),
    ...(o.movie ? askedDimensions(o.userText, 'movie') : []),
  ]
  const table = o.lang === 'vi' ? UNVERIFIED_SENTENCE_VI : UNVERIFIED_SENTENCE_EN
  const missing = [...new Set(dims)].filter(d => !alreadySaid(o.prose, d, o.lang))
  return missing.length ? `${missing.map(d => table[d]).join(' ')} ` : ''
}

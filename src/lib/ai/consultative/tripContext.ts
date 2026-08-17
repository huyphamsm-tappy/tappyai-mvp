import { normalizeVN, detectPlanningIntent } from '../intent'

// ── The trip context, and the transport-mode stage (owner product decision) ──
//
// "Ask which transport mode" is a DETERMINISTIC product stage, not something the
// model is left to remember. The backend decides WHETHER to ask; the prompt only
// phrases the question. That distinction is the whole point: an LLM asked to
// "remember to ask about transport" will sometimes ask twice, sometimes never,
// and sometimes ask in the middle of a restaurant search.
//
// State persists the same way every other consultative signal does — by folding
// the message history. No table, no session store, and it works for anonymous
// users.
//
// Scope is deliberately narrow, per the owner: two modes (máy bay / xe khách),
// no generalised transport workflow.

export type TransportMode = 'flight' | 'bus'

export interface TripContext {
  /** A trip is genuinely in play (planning intent, or a destination + travel verb). */
  isTrip: boolean
  destination: string | null
  origin: string | null
  durationDays: number | null
  /** The mode the user chose. The LATEST choice wins — see FLOW-10. */
  mode: TransportMode | null
  /** The deterministic answer to "should Tappy ask máy bay hay xe khách?". */
  shouldAskTransportMode: boolean
}

/**
 * The transport-mode question, as dynamic prompt content.
 *
 * The BACKEND decides whether this block is sent (`shouldAskTransportMode`); the
 * model only phrases the question in the user's language. That split is the
 * owner's requirement: the decision must not depend on an LLM spontaneously
 * remembering to ask.
 *
 * Goes into `dynamic` only — never the cached `shared` segment.
 */
export function buildTransportModeBlock(): string {
  return `\n\n===== GIAI DOAN: CHON PHUONG TIEN =====
User da chot diem den nhung CHUA chon phuong tien di lai. Truoc khi tu van chi tiet ve ve/gia, HAY HOI DUNG MOT CAU ngan: user muon di MAY BAY hay XE KHACH.
- Hoi bang NGON NGU cua cau tra loi, tu dien dat tu nhien (vd tieng Viet: "Bạn muốn đi máy bay hay xe khách?"; tieng Anh: "Would you prefer to fly or travel by coach?").
- Chi hoi MOT lan. Neu user da tra loi o luot truoc thi KHONG hoi lai.
- Van co the tu van ngan ve diem den truoc, roi hoi o CUOI cau tra loi (theo R7 muc b).
- KHONG doan thay user, KHONG tu chon phuong tien ho.
==========================================`
}

/** Places the product serves. Matched against normalizeVN output. */
const PLACES: ReadonlyArray<[RegExp, string]> = [
  [/da nang|danang/, 'da nang'],
  [/ho chi minh|hcm|sai gon|saigon/, 'ho chi minh'],
  [/ha noi|hanoi/, 'ha noi'],
  [/phu quoc/, 'phu quoc'],
  [/nha trang/, 'nha trang'],
  [/hoi an/, 'hoi an'],
  [/da lat|dalat/, 'da lat'],
  [/vung tau/, 'vung tau'],
  [/ha long|halong/, 'ha long'],
  [/sa pa|sapa/, 'sa pa'],
  [/ninh binh/, 'ninh binh'],
  [/\bhue\b/, 'hue'],
  [/can tho/, 'can tho'],
  [/mui ne/, 'mui ne'],
  [/quy nhon/, 'quy nhon'],
  [/phan thiet/, 'phan thiet'],
  [/con dao/, 'con dao'],
  [/hai phong/, 'hai phong'],
]

/**
 * The mode the user named.
 *
 * Deliberately requires a transport WORD. "Tôi muốn bay" counts because `bay`
 * is the verb for flying; "nhanh" or "rẻ" do not, because they describe a
 * preference rather than a choice of mode.
 */
const FLIGHT = /\bmay bay\b|\bbay\b|\bflight\b|\bfly\b|\bflying\b|\bplane\b|\bair\b/
const BUS = /\bxe khach\b|\bxe do\b|xe giuong nam|\blimousine\b|\bbus\b|\bcoach\b/

export function detectTransportMode(text: string): TransportMode | null {
  const t = normalizeVN(String(text ?? '').toLowerCase())
  if (!t) return null
  // Bus is tested first: "xe khách" is unambiguous, whereas a sentence can
  // mention flying while choosing the coach ("thay vì bay, tôi đi xe khách").
  if (BUS.test(t)) return 'bus'
  if (FLIGHT.test(t)) return 'flight'
  return null
}

/** "3 ngày", "3 days", "2 đêm", "2 nights". */
const DURATION = /(\d{1,2})\s*(ngay|dem|days?|nights?)\b/

/** A destination follows a movement word; an origin follows a source word. */
const ORIGIN_LEAD = /(?:di\s+)?tu\s+|\bfrom\s+/
const DEST_LEAD = /\bdi\s+|\bden\s+|\btoi\s+|\bto\s+|\bin\s+/

/** Travel verbs that make a destination a TRIP rather than a place lookup. */
const TRAVEL_VERB = /\bdu lich\b|\bdi choi\b|\bchuyen di\b|\bdi\b.*\bngay\b|\btrip\b|\btravel\b|\bgo to\b|\bvisit\b|\bfly\b|\bbay\b/

/** Requests that are about a place, not a journey — FLOW-09. */
const NON_TRIP = /quan an|nha hang|restaurant|\bcafe\b|ca phe|thoi tiet|weather|gia vang|gold price|\btin tuc\b|\bnews\b/

function findPlace(fragment: string): string | null {
  for (const [re, name] of PLACES) if (re.test(fragment)) return name
  return null
}

/**
 * Fold the conversation into the trip context.
 *
 * Reads USER turns only: an assistant asking "máy bay hay xe khách?" must not
 * count as the user having answered.
 */
export function resolveTripContext(
  messages: Array<{ role: string; content: unknown }>,
): TripContext {
  const out: TripContext = {
    isTrip: false, destination: null, origin: null,
    durationDays: null, mode: null, shouldAskTransportMode: false,
  }

  const userTurns = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === 'user')
    .map(m => (typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? (m.content as Array<{ type?: string; text?: string }>)
            .map(c => (c?.type === 'text' ? c.text || '' : '')).join(' ')
        : ''))

  let sawNonTrip = false

  for (const raw of userTurns) {
    const t = normalizeVN(String(raw ?? '').toLowerCase())
    if (!t) continue

    if (detectPlanningIntent(raw as string) === 'trip') out.isTrip = true
    if (NON_TRIP.test(t)) sawNonTrip = true

    // ── Origin, then destination ──────────────────────────────────────────
    // Origin is read first and its span removed, so "đi Đà Nẵng … đi từ TP.HCM"
    // cannot let the origin phrase also satisfy the destination match.
    let remaining = t
    const originMatch = t.match(ORIGIN_LEAD)
    if (originMatch && originMatch.index !== undefined) {
      const after = t.slice(originMatch.index + originMatch[0].length)
      const place = findPlace(after)
      if (place) {
        out.origin = place
        remaining = t.slice(0, originMatch.index)
      }
    }

    const destMatch = remaining.match(DEST_LEAD)
    if (destMatch && destMatch.index !== undefined) {
      const place = findPlace(remaining.slice(destMatch.index))
      if (place && place !== out.origin) out.destination = place
    }
    // A place named with no movement word at all still counts as the
    // destination when nothing else has claimed it.
    if (!out.destination) {
      const bare = findPlace(remaining)
      if (bare && bare !== out.origin) out.destination = bare
    }

    const dur = t.match(DURATION)
    if (dur) out.durationDays = parseInt(dur[1], 10)

    // Latest choice wins, so a later "thôi, đi xe khách" replaces an earlier
    // flight preference outright rather than accumulating.
    const mode = detectTransportMode(raw as string)
    if (mode) out.mode = mode

    // A destination reached by a travel verb is a trip even without the
    // planning block's stricter days/budget signals.
    if (out.destination && TRAVEL_VERB.test(t)) out.isTrip = true
  }

  // ── The deterministic stage decision ──────────────────────────────────────
  //
  // Ask only when all four hold. Each exclusion maps to an owner requirement:
  // never on a non-trip query, never without a destination, never twice, and
  // never when the user already told us.
  out.shouldAskTransportMode =
    out.isTrip
    && !sawNonTrip
    && out.destination !== null
    && out.mode === null

  return out
}

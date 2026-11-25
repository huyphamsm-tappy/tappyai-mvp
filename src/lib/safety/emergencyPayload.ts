// Contextual Safety Gateway, response side (R13 §10.5): the structured payload every client renders for an EMERGENCY, and the rules that decide which hotline cards may be in it.
// Pure. R13 says no phone number is hardcoded as a general hotline and none counts until it is a VERIFIED configuration with its own category, jurisdiction, scope, official source, hours and
// last-verified date. VERIFIED_HOTLINES below holds only what the owner verified (his report of 11/11: 111 to 115, each with its official source); a field his report left UNKNOWN stays absent.
// An EMERGENCY with no card still returns immediate guidance (never a blank answer); a fact about where the person is is never guessed from their language.
// NOT wired into the chat route or any client yet: it is the contract and its enforcement.

export type Severity = 'SAFE' | 'SOFT_FLAG' | 'HARD_BLOCK' | 'EMERGENCY'
export type DisplayScope = 'LOCAL_EMERGENCY' | 'HOME_MARKET_RESOURCE' | 'GLOBAL_DIRECTORY'
/** The owner's report (11/11) keeps the five numbers apart by function: a number is never classified under a function its source does not give it (111 is not a general mental-health line). */
export type EmergencyCategory = 'MEDICAL' | 'CHILD_PROTECTION' | 'HUMAN_TRAFFICKING' | 'POLICE' | 'FIRE_RESCUE' | 'CIVIL_DEFENCE' | 'MENTAL_HEALTH' | 'OTHER'
export type JurisdictionStatus = 'VERIFIED' | 'UNKNOWN' | 'LOW_CONFIDENCE'

export interface VerifiedHotline {
  hotlineId: string
  /** ISO 3166-1 alpha-2, or 'INTERNATIONAL'; never inferred from the locale */
  jurisdiction: string
  displayScope: DisplayScope
  emergencyCategory: EmergencyCategory
  phoneNumber?: string
  serviceUrl?: string
  /** required when a home-market or non-local resource is shown */
  scopeWarningLocaleKey?: string
  displayName: string
  /** written only where an official source gives it */
  operatingHours?: string
  /** true only where an official source says calls are free; absent = not established (never "false") */
  freeOfCharge?: true
  timezone?: string
  /** internal: caveats from the verification (never shown as a fact to the person) */
  notes?: string
  sourceUrl: string
  lastVerifiedAt: string
  verificationStatus: 'VERIFIED' | 'REQUIRES_RECHECK' | 'DISABLED'
}

const VN_BASE = { jurisdiction: 'VN', displayScope: 'LOCAL_EMERGENCY', timezone: 'Asia/Ho_Chi_Minh', lastVerifiedAt: '2026-11-11T00:00:00Z', verificationStatus: 'VERIFIED' } as const
const UNIFIED_113 = 'The 113/114/115 unified-intake integration is in transition: the HCMC Government Portal (4 Nov 2026) says all three stay usable there; nationwide completion is NOT verified, nor hours or whether calls are free. Do not state either.'

/**
 * The hotlines the owner has verified: VIETNAM_HOTLINE_VERIFICATION_REPORT_FOR_CLAUDE_2026-11-11 (the owner's own list, each number with its official source). Hours and "free of charge" are written ONLY where
 * that report verified them (111 and 112); for 113, 114 and 115 the report left them UNKNOWN and so do these entries. Province-by-province routing and the capacity of 115 locally are not claimed.
 */
export const VERIFIED_HOTLINES: readonly VerifiedHotline[] = [
  { ...VN_BASE, hotlineId: 'vn-111-child-protection', emergencyCategory: 'CHILD_PROTECTION', phoneNumber: '111', displayName: 'Tổng đài Quốc gia Bảo vệ Trẻ em 111', operatingHours: '24/7', freeOfCharge: true,
    sourceUrl: 'https://tongdai111.vn/sites/gioi-thieu', notes: 'Run by the Center for Consultation and Communication Services, Department of Mothers and Children, Ministry of Health. Child and family counselling scope: not a general adult mental-health line.' },
  { ...VN_BASE, hotlineId: 'vn-111-human-trafficking', emergencyCategory: 'HUMAN_TRAFFICKING', phoneNumber: '111', displayName: 'Tổng đài phòng, chống mua bán người 111', operatingHours: '24/7', freeOfCharge: true,
    sourceUrl: 'https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/6/45339/57267-1-2025873-874162-2025-nd-cp.pdf', notes: 'Decree 162/2025/NĐ-CP Article 4: the anti-trafficking hotline uses the short code 111, 24 hours every day, calls free.' },
  { ...VN_BASE, hotlineId: 'vn-112-civil-defence', emergencyCategory: 'CIVIL_DEFENCE', phoneNumber: '112', displayName: 'Tổng đài 112 - thông tin sự cố, thiên tai, thảm họa', operatingHours: '24/7', freeOfCharge: true,
    sourceUrl: 'https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/7/45545/57679-1-2025959-960200-2025-nd-cp.pdf', notes: 'Decree 200/2025/NĐ-CP: provincial Military Commands; operating nationwide since 23 Aug 2025; linked with 113, 114 and 115 but does not replace them. Kept apart from the 113/114/115 integration project.' },
  { ...VN_BASE, hotlineId: 'vn-113-police', emergencyCategory: 'POLICE', phoneNumber: '113', displayName: 'Đường dây 113 - Công an (an ninh, trật tự khẩn cấp)',
    sourceUrl: 'https://mps.gov.vn/bai-viet/moi-lam-viec-01-cong-dan-nhieu-lan-goi-dien-quay-roi-so-113-1782459200', notes: UNIFIED_113 + ' Circular 42/2026/TT-BYT (effective 1 Nov 2026) routes medical-support information reaching 113 to medical staff at the provincial Police Information Command Center.' },
  { ...VN_BASE, hotlineId: 'vn-114-fire-rescue', emergencyCategory: 'FIRE_RESCUE', phoneNumber: '114', displayName: 'Đường dây 114 - Cứu hỏa, cứu nạn cứu hộ',
    sourceUrl: 'https://congbao.chinhphu.vn/tai-ve-van-ban-so-55-2024-qh15-43594-53752', notes: UNIFIED_113 + ' Law 55/2024/QH15 Article 6(2): 114 is the nationwide number for reporting fires and rescue.' },
  { ...VN_BASE, hotlineId: 'vn-115-medical', emergencyCategory: 'MEDICAL', phoneNumber: '115', displayName: 'Đường dây 115 - Cấp cứu y tế (điều xe cứu thương)',
    sourceUrl: 'https://adminmoh.moh.gov.vn/web/guest/tin-noi-bat/-/asset_publisher/3Yst7YhbkA5j/content/thu-truong-bo-y-te-tran-van-thuan-to-chuc-mang-luoi-cap-cuu-ngoai-vien-theo-huong-gan-dan', notes: UNIFIED_113 + ' A nationally assigned number does not prove every locality has a working ambulance-dispatch network (Ministry of Health, March 2026).' },
]

export interface EmergencyFallbackGuidance {
  jurisdictionStatus: JurisdictionStatus
  immediateGuidanceKey: string
  locationClarificationPromptKey?: string
}

export interface SafetyResponsePayload {
  severity: Severity
  reasonCode: string
  locale: string
  userFacingMessageKey: string
  hotlineCards: VerifiedHotline[]
  emergencyFallback?: EmergencyFallbackGuidance
  actionsAllowed: string[]
  actionsDenied: string[]
}

/** Why a card may not be shown, or null when its own shape is valid for its scope. Pure. */
export function cardShapeProblem(h: VerifiedHotline): string | null {
  if (h.verificationStatus !== 'VERIFIED') return 'not_verified'
  if (!h.sourceUrl || !h.lastVerifiedAt || !h.displayName) return 'missing_source_or_date'
  if (h.displayScope === 'LOCAL_EMERGENCY') return h.phoneNumber ? null : 'local_needs_phone'
  if (h.displayScope === 'GLOBAL_DIRECTORY') return h.serviceUrl && h.scopeWarningLocaleKey ? null : 'directory_needs_url_and_label'
  return (h.phoneNumber || h.serviceUrl) && h.scopeWarningLocaleKey ? null : 'home_market_needs_channel_and_label'
}

export interface SafetyContext {
  severity: Severity
  reasonCode: string
  locale: string
  /** where the person IS: VERIFIED only from a trustworthy source, never from `locale` */
  jurisdictionStatus: JurisdictionStatus
  currentJurisdiction?: string | null
  /** the person's home market, only when known from a trustworthy profile/selection */
  homeMarket?: string | null
  category: EmergencyCategory
  /** a location question may be asked in this episode (see claimLocationClarification) */
  mayAskLocation: boolean
}

/** Which of the offered cards may appear for this person right now. Pure. */
export function eligibleCards(ctx: Pick<SafetyContext, 'jurisdictionStatus' | 'currentJurisdiction' | 'homeMarket' | 'category'>, offered: readonly VerifiedHotline[]): VerifiedHotline[] {
  return offered.filter(h => {
    if (cardShapeProblem(h) !== null) return false
    if (h.displayScope === 'LOCAL_EMERGENCY') {
      return ctx.jurisdictionStatus === 'VERIFIED' && !!ctx.currentJurisdiction && h.jurisdiction === ctx.currentJurisdiction && h.emergencyCategory === ctx.category
    }
    if (h.displayScope === 'HOME_MARKET_RESOURCE') return !!ctx.homeMarket && h.jurisdiction === ctx.homeMarket && h.emergencyCategory === ctx.category
    return h.emergencyCategory === ctx.category || h.emergencyCategory === 'OTHER'
  })
}

/**
 * The payload for one assessed turn. An EMERGENCY always carries immediate guidance (even with no card); a location question is added only when the jurisdiction is not verified
 * AND this episode may still ask. Tool permissions are denied while the severity is EMERGENCY or HARD_BLOCK. Pure.
 */
export function buildSafetyPayload(ctx: SafetyContext, hotlines: readonly VerifiedHotline[] = VERIFIED_HOTLINES): SafetyResponsePayload {
  const emergency = ctx.severity === 'EMERGENCY'
  const base = { severity: ctx.severity, reasonCode: ctx.reasonCode, locale: ctx.locale }
  const blocked = emergency || ctx.severity === 'HARD_BLOCK'
  const actions = { actionsAllowed: blocked ? [] : ['answer'], actionsDenied: blocked ? ['tool_use'] : [] }
  if (!emergency) return { ...base, userFacingMessageKey: `safety.${ctx.severity.toLowerCase()}`, hotlineCards: [], ...actions }
  const cards = eligibleCards(ctx, hotlines)
  const unknownPlace = ctx.jurisdictionStatus !== 'VERIFIED'
  return {
    ...base,
    userFacingMessageKey: 'safety.emergency',
    hotlineCards: cards,
    emergencyFallback: {
      jurisdictionStatus: ctx.jurisdictionStatus,
      immediateGuidanceKey: unknownPlace ? 'safety.emergency.guidance.unknownPlace' : 'safety.emergency.guidance.knownPlace',
      ...(unknownPlace && ctx.mayAskLocation ? { locationClarificationPromptKey: 'safety.emergency.askLocation' } : {}),
    },
    ...actions,
  }
}

// ── Emergency episode guard: at most ONE location question per active episode ─────────────────────────────────────────────

export interface EpisodeState {
  emergencyEpisodeId: string
  status: 'ACTIVE' | 'INACTIVE' | 'RESOLVED'
  locationClarificationPromptIssued: boolean
  jurisdictionStatus: JurisdictionStatus
  lastSafetyRelevantActivityAt: string
  inactivityWindowSeconds: number
}

/** An ACTIVE episode with no safety-relevant activity for its inactivity window becomes INACTIVE; RESOLVED stays. Pure. */
export function episodeStatusAt(e: EpisodeState, now: Date): EpisodeState['status'] {
  if (e.status !== 'ACTIVE') return e.status
  const idle = (now.getTime() - Date.parse(e.lastSafetyRelevantActivityAt)) / 1000
  return Number.isFinite(idle) && idle > e.inactivityWindowSeconds ? 'INACTIVE' : 'ACTIVE'
}

/**
 * May the server ask where the person is, in this episode? Only while the episode is ACTIVE, the jurisdiction is not verified, and no question was issued yet. The CALLER must claim the
 * issuance atomically by episode id (a store compare-and-set) before sending, so concurrent tabs or requests cannot ask twice; this function only decides eligibility. Pure.
 */
export function mayAskLocation(e: EpisodeState, now: Date): boolean {
  return episodeStatusAt(e, now) === 'ACTIVE' && e.jurisdictionStatus !== 'VERIFIED' && !e.locationClarificationPromptIssued
}

// Contextual Safety Gateway, response side (R13 §10.5): the structured payload every client renders for an EMERGENCY, and the rules that decide which hotline cards may be in it.
// Pure. No number is written in this file on purpose: R13 says no phone number is hardcoded as a general hotline and none counts until it is a VERIFIED configuration with its own
// category, jurisdiction, scope, official source, hours and last-verified date. VERIFIED_HOTLINES below is therefore EMPTY until the owner (with legal) supplies and verifies them.
// An EMERGENCY with no card still returns immediate guidance (never a blank answer); a fact about where the person is is never guessed from their language.
// NOT wired into the chat route or any client yet: it is the contract and its enforcement.

export type Severity = 'SAFE' | 'SOFT_FLAG' | 'HARD_BLOCK' | 'EMERGENCY'
export type DisplayScope = 'LOCAL_EMERGENCY' | 'HOME_MARKET_RESOURCE' | 'GLOBAL_DIRECTORY'
export type EmergencyCategory = 'MEDICAL' | 'CHILD_PROTECTION' | 'MENTAL_HEALTH' | 'OTHER'
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
  operatingHours?: string
  timezone?: string
  sourceUrl: string
  lastVerifiedAt: string
  verificationStatus: 'VERIFIED' | 'REQUIRES_RECHECK' | 'DISABLED'
}

/** The hotlines the owner has verified. EMPTY by design: nothing here is real until it carries its official source and verification date. */
export const VERIFIED_HOTLINES: readonly VerifiedHotline[] = []

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

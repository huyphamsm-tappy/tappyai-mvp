import { describe, it, expect } from 'vitest'
import { buildSafetyPayload, cardShapeProblem, eligibleCards, mayAskLocation, episodeStatusAt, VERIFIED_HOTLINES, type VerifiedHotline, type SafetyContext, type EpisodeState } from './emergencyPayload'

// Fake cards for the contract tests only: invented placeholders, not real numbers, never exported.
const card = (o: Partial<VerifiedHotline> = {}): VerifiedHotline => ({
  hotlineId: 'h1', jurisdiction: 'XX', displayScope: 'LOCAL_EMERGENCY', emergencyCategory: 'MEDICAL', phoneNumber: '000-TEST', displayName: 'Test line',
  sourceUrl: 'https://example.invalid/source', lastVerifiedAt: '2026-11-01T00:00:00Z', verificationStatus: 'VERIFIED', ...o,
})
const ctx = (o: Partial<SafetyContext> = {}): SafetyContext => ({ severity: 'EMERGENCY', reasonCode: 'TEST', locale: 'vi', jurisdictionStatus: 'VERIFIED', currentJurisdiction: 'XX', category: 'MEDICAL', mayAskLocation: true, ...o })

describe('the shipped registry', () => {
  it('is EMPTY: no number is real until the owner verifies it with its official source', () => {
    expect(VERIFIED_HOTLINES).toEqual([])
  })
})

describe('cardShapeProblem', () => {
  it('only VERIFIED cards with a source and a date', () => {
    expect(cardShapeProblem(card())).toBeNull()
    expect(cardShapeProblem(card({ verificationStatus: 'REQUIRES_RECHECK' }))).toBe('not_verified')
    expect(cardShapeProblem(card({ verificationStatus: 'DISABLED' }))).toBe('not_verified')
    expect(cardShapeProblem(card({ sourceUrl: '' }))).toBe('missing_source_or_date')
    expect(cardShapeProblem(card({ lastVerifiedAt: '' }))).toBe('missing_source_or_date')
  })
  it('each scope has its own required channel and label', () => {
    expect(cardShapeProblem(card({ phoneNumber: undefined }))).toBe('local_needs_phone')
    expect(cardShapeProblem(card({ displayScope: 'GLOBAL_DIRECTORY', phoneNumber: undefined, serviceUrl: 'https://x.invalid' }))).toBe('directory_needs_url_and_label')
    expect(cardShapeProblem(card({ displayScope: 'GLOBAL_DIRECTORY', phoneNumber: undefined, serviceUrl: 'https://x.invalid', scopeWarningLocaleKey: 'k' }))).toBeNull()
    expect(cardShapeProblem(card({ displayScope: 'HOME_MARKET_RESOURCE' }))).toBe('home_market_needs_channel_and_label')
    expect(cardShapeProblem(card({ displayScope: 'HOME_MARKET_RESOURCE', scopeWarningLocaleKey: 'k' }))).toBeNull()
  })
})

describe('eligibleCards', () => {
  it('a LOCAL card appears only when the current place is VERIFIED, matches, and the category fits', () => {
    expect(eligibleCards(ctx(), [card()])).toHaveLength(1)
    expect(eligibleCards(ctx({ jurisdictionStatus: 'UNKNOWN' }), [card()])).toEqual([])
    expect(eligibleCards(ctx({ jurisdictionStatus: 'LOW_CONFIDENCE' }), [card()])).toEqual([])
    expect(eligibleCards(ctx({ currentJurisdiction: 'YY' }), [card()])).toEqual([])
    expect(eligibleCards(ctx({ category: 'MENTAL_HEALTH' }), [card()])).toEqual([])
  })
  it('a child-protection line is never offered as the mental-health line of an adult (category must match)', () => {
    expect(eligibleCards(ctx({ category: 'MENTAL_HEALTH' }), [card({ emergencyCategory: 'CHILD_PROTECTION' })])).toEqual([])
  })
  it('a HOME-MARKET card needs a trusted home market and the same category, and does not need the current place', () => {
    const home = card({ displayScope: 'HOME_MARKET_RESOURCE', jurisdiction: 'HM', scopeWarningLocaleKey: 'k' })
    expect(eligibleCards(ctx({ jurisdictionStatus: 'UNKNOWN', homeMarket: 'HM' }), [home])).toHaveLength(1)
    expect(eligibleCards(ctx({ jurisdictionStatus: 'UNKNOWN', homeMarket: null }), [home])).toEqual([])
    expect(eligibleCards(ctx({ jurisdictionStatus: 'UNKNOWN', homeMarket: 'ZZ' }), [home])).toEqual([])
  })
  it('an unverified or misshapen card never appears', () => {
    expect(eligibleCards(ctx(), [card({ verificationStatus: 'DISABLED' }), card({ phoneNumber: undefined })])).toEqual([])
  })
})

describe('buildSafetyPayload', () => {
  it('EMERGENCY with no card at all still carries immediate guidance (never a blank answer) and denies tools', () => {
    const p = buildSafetyPayload(ctx({ jurisdictionStatus: 'UNKNOWN', currentJurisdiction: null }), [])
    expect(p.hotlineCards).toEqual([])
    expect(p.emergencyFallback).toMatchObject({ jurisdictionStatus: 'UNKNOWN', immediateGuidanceKey: 'safety.emergency.guidance.unknownPlace', locationClarificationPromptKey: 'safety.emergency.askLocation' })
    expect(p.actionsDenied).toContain('tool_use'); expect(p.actionsAllowed).toEqual([])
  })
  it('the location question is omitted once the episode has asked, and when the place is verified', () => {
    expect(buildSafetyPayload(ctx({ jurisdictionStatus: 'UNKNOWN', mayAskLocation: false }), []).emergencyFallback?.locationClarificationPromptKey).toBeUndefined()
    expect(buildSafetyPayload(ctx(), [card()]).emergencyFallback?.locationClarificationPromptKey).toBeUndefined()
  })
  it('the cards in the payload are the only list, and only eligible ones', () => {
    const p = buildSafetyPayload(ctx(), [card(), card({ hotlineId: 'h2', jurisdiction: 'YY' })])
    expect(p.hotlineCards.map(c => c.hotlineId)).toEqual(['h1'])
    expect(JSON.stringify(p.emergencyFallback)).not.toContain('000-TEST')
  })
  it('the locale never decides the place: Vietnamese with an unknown place gets no LOCAL card', () => {
    const p = buildSafetyPayload(ctx({ locale: 'vi', jurisdictionStatus: 'UNKNOWN', currentJurisdiction: 'XX' }), [card()])
    expect(p.hotlineCards).toEqual([])
  })
  it('non-emergency severities carry no card; HARD_BLOCK denies tools, SAFE allows an answer', () => {
    expect(buildSafetyPayload(ctx({ severity: 'SAFE' }), [card()])).toMatchObject({ hotlineCards: [], actionsAllowed: ['answer'], actionsDenied: [] })
    expect(buildSafetyPayload(ctx({ severity: 'HARD_BLOCK' }), [card()])).toMatchObject({ hotlineCards: [], actionsDenied: ['tool_use'] })
    expect(buildSafetyPayload(ctx({ severity: 'SOFT_FLAG' }), [card()]).emergencyFallback).toBeUndefined()
  })
  it('defaults to the shipped (empty) registry: today an EMERGENCY yields guidance and no number', () => {
    const p = buildSafetyPayload(ctx())
    expect(p.hotlineCards).toEqual([]); expect(p.emergencyFallback).toBeDefined()
  })
})

describe('the emergency episode guard', () => {
  const ep = (o: Partial<EpisodeState> = {}): EpisodeState => ({ emergencyEpisodeId: 'e1', status: 'ACTIVE', locationClarificationPromptIssued: false, jurisdictionStatus: 'UNKNOWN', lastSafetyRelevantActivityAt: '2026-11-10T08:00:00Z', inactivityWindowSeconds: 3600, ...o })
  const now = new Date('2026-11-10T08:30:00Z')
  it('one question per active episode while the place is unverified', () => {
    expect(mayAskLocation(ep(), now)).toBe(true)
    expect(mayAskLocation(ep({ locationClarificationPromptIssued: true }), now)).toBe(false)
    expect(mayAskLocation(ep({ jurisdictionStatus: 'VERIFIED' }), now)).toBe(false)
    expect(mayAskLocation(ep({ status: 'RESOLVED' }), now)).toBe(false)
  })
  it('an episode idle past its window is INACTIVE and may not ask; RESOLVED stays resolved', () => {
    expect(episodeStatusAt(ep(), new Date('2026-11-10T09:30:01Z'))).toBe('INACTIVE')
    expect(mayAskLocation(ep(), new Date('2026-11-10T10:00:00Z'))).toBe(false)
    expect(episodeStatusAt(ep({ status: 'RESOLVED' }), new Date('2027-01-01T00:00:00Z'))).toBe('RESOLVED')
  })
})

import { describe, it, expect } from 'vitest'
import { buildSafetyPayload, cardShapeProblem, eligibleCards, mayAskLocation, episodeStatusAt, VERIFIED_HOTLINES, type VerifiedHotline, type SafetyContext, type EpisodeState } from './emergencyPayload'

// Fake cards for the contract tests only: invented placeholders, not real numbers, never exported.
const card = (o: Partial<VerifiedHotline> = {}): VerifiedHotline => ({
  hotlineId: 'h1', jurisdiction: 'XX', displayScope: 'LOCAL_EMERGENCY', emergencyCategory: 'MEDICAL', phoneNumber: '000-TEST', displayName: 'Test line',
  sourceUrl: 'https://example.invalid/source', lastVerifiedAt: '2026-11-01T00:00:00Z', verificationStatus: 'VERIFIED', ...o,
})
const ctx = (o: Partial<SafetyContext> = {}): SafetyContext => ({ severity: 'EMERGENCY', reasonCode: 'TEST', locale: 'vi', jurisdictionStatus: 'VERIFIED', currentJurisdiction: 'XX', category: 'MEDICAL', mayAskLocation: true, ...o })

// 11/11: the owner supplied the verified list (VIETNAM_HOTLINE_VERIFICATION_REPORT_FOR_CLAUDE_2026-11-11.md: 111, 112, 113, 114, 115, each with its official source). The old test said the registry
// is EMPTY because no number was verified; what it protected (no number without its source, date and scope) is now the set of assertions below, and the owner's own "UNKNOWN" fields stay unknown.
describe('the shipped registry (the owner\'s verified list of 11/11)', () => {
  const byNumber = (n: string) => VERIFIED_HOTLINES.filter(h => h.phoneNumber === n)
  it('every entry is a VERIFIED local card of Viet Nam with an https official source and a date, and passes the shape rule', () => {
    expect(VERIFIED_HOTLINES.length).toBeGreaterThan(0)
    for (const h of VERIFIED_HOTLINES) {
      expect(cardShapeProblem(h), h.hotlineId).toBeNull()
      expect(h.jurisdiction).toBe('VN')
      expect(h.displayScope).toBe('LOCAL_EMERGENCY')
      expect(h.sourceUrl, h.hotlineId).toMatch(/^https:\/\/(tongdai111\.vn|congbaocdn\.chinhphu\.vn|xaydungchinhsach\.chinhphu\.vn|mps\.gov\.vn|congbao\.chinhphu\.vn|adminmoh\.moh\.gov\.vn|vanban\.chinhphu\.vn|tphcm\.chinhphu\.vn)\//)
      expect(h.lastVerifiedAt).toMatch(/^2026-11-11/)
    }
    expect(new Set(VERIFIED_HOTLINES.map(h => h.hotlineId)).size).toBe(VERIFIED_HOTLINES.length)
  })
  it('the five numbers are kept apart by what they do: 111 child protection and anti-trafficking (two functions on one number), 112 civil defence, 113 police, 114 fire and rescue, 115 medical', () => {
    expect(byNumber('111').map(h => h.emergencyCategory).sort()).toEqual(['CHILD_PROTECTION', 'HUMAN_TRAFFICKING'])
    expect(byNumber('112').map(h => h.emergencyCategory)).toEqual(['CIVIL_DEFENCE'])
    expect(byNumber('113').map(h => h.emergencyCategory)).toEqual(['POLICE'])
    expect(byNumber('114').map(h => h.emergencyCategory)).toEqual(['FIRE_RESCUE'])
    expect(byNumber('115').map(h => h.emergencyCategory)).toEqual(['MEDICAL'])
  })
  it('hours and cost are written ONLY where the owner\'s report verified them (111 and 112: 24/7 and free); 113, 114 and 115 carry neither, and no entry claims a mental-health line', () => {
    for (const n of ['111', '112']) for (const h of byNumber(n)) { expect(h.operatingHours).toBe('24/7'); expect(h.freeOfCharge).toBe(true) }
    for (const n of ['113', '114', '115']) for (const h of byNumber(n)) { expect(h.operatingHours).toBeUndefined(); expect(h.freeOfCharge).toBeUndefined() }
    expect(VERIFIED_HOTLINES.some(h => h.emergencyCategory === 'MENTAL_HEALTH')).toBe(false)
  })
  it('113, 114 and 115 say the unified-113 integration is transitional and not proven nationwide', () => {
    for (const n of ['113', '114', '115']) for (const h of byNumber(n)) expect(h.notes ?? '', h.hotlineId).toMatch(/transition|chuyển tiếp/i)
  })
  it('a medical emergency in a verified Vietnamese place offers 115 and nothing else; a fire offers 114; the person\'s language never picks the place', () => {
    const med = buildSafetyPayload(ctx({ category: 'MEDICAL', currentJurisdiction: 'VN', jurisdictionStatus: 'VERIFIED' }))
    expect(med.hotlineCards.map(h => h.phoneNumber)).toEqual(['115'])
    expect(buildSafetyPayload(ctx({ category: 'FIRE_RESCUE', currentJurisdiction: 'VN' })).hotlineCards.map(h => h.phoneNumber)).toEqual(['114'])
    expect(buildSafetyPayload(ctx({ category: 'MEDICAL', currentJurisdiction: 'VN', jurisdictionStatus: 'UNKNOWN', locale: 'vi' })).hotlineCards).toEqual([])
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

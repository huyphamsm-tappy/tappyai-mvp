import { describe, it, expect } from 'vitest'
import { attachmentOnlyPolicyOn, marketGateOn, safetyEmergencyOn, hotlineClaimGuardOn } from './r13Flags'

const cases: Array<[string, (e?: Record<string, string | undefined>) => boolean]> = [
  ['ATTACHMENT_ONLY_POLICY', attachmentOnlyPolicyOn],
  ['MARKET_GATE', marketGateOn],
  ['SAFETY_EMERGENCY', safetyEmergencyOn],
  ['HOTLINE_CLAIM_GUARD', hotlineClaimGuardOn],
]

describe.each(cases)('%s flag', (name, on) => {
  it('is OFF unless exactly "1"', () => {
    expect(on({})).toBe(false)
    for (const v of ['0', 'true', 'on', ' 1', '1 ', '01', 'yes']) expect(on({ [name]: v })).toBe(false)
    expect(on({ [name]: '1' })).toBe(true)
  })
  it('is locked in a production runtime unless the owner lists the name', () => {
    expect(on({ [name]: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(on({ [name]: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: name })).toBe(true)
    expect(on({ [name]: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'SOMETHING_ELSE' })).toBe(false)
  })
  it('one flag never switches another', () => {
    const others = cases.filter(([n]) => n !== name)
    for (const [, f] of others) expect(f({ [name]: '1' })).toBe(false)
  })
})

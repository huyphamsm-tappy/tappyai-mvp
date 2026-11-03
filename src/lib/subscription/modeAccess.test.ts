import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deepResearchOffered } from './modeAccess'

// The composer's "+" menu follows the plan as the server enforces it (lib/plans/tiers.ts): Pip (Free, a visitor, no live plan) has Chat only,
// so Deep Research is not offered; MoMo / Coco / Tappy have it. Off or in doubt (plans not on sale: /api/payments/me answers 404; offline;
// a bad body) the menu keeps it - the page never takes a mode away on doubt. Same rule as the Android app.
const me = (signedIn: boolean, state: string | null, plan: string | null) => ({ signedIn, subscription: { state, plan: plan ? { id: plan } : null } })

describe('deepResearchOffered', () => {
  it('no answer about the plan keeps it', () => {
    expect(deepResearchOffered(null)).toBe(true)
    expect(deepResearchOffered(undefined)).toBe(true)
    expect(deepResearchOffered('nonsense')).toBe(true)
  })
  it('a visitor, or an account without a live plan, is not offered it', () => {
    expect(deepResearchOffered(me(false, 'NONE', null))).toBe(false)
    for (const state of ['NONE', 'PENDING', 'EXPIRED', 'CANCELLED', null]) expect(deepResearchOffered(me(true, state, 'coco'))).toBe(false)
    expect(deepResearchOffered(me(true, 'ACTIVE', 'free'))).toBe(false)
  })
  it('every paid plan, and an active older plan the server cannot name, is offered it', () => {
    for (const plan of ['pip', 'momo', 'coco', 'milo', 'sunny', 'promax1m', 'promax3m', null]) expect(deepResearchOffered(me(true, 'ACTIVE', plan))).toBe(true)
  })
})

describe('the composer menu', () => {
  it('draws Deep Research only when the plan offers it', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')
    expect(source).toContain('useDeepResearchOffered()')
    expect(source).toContain('deepOffered')
  })
})

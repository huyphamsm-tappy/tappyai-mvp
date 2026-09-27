import { describe, it, expect } from 'vitest'
import { consultativeV1Enabled } from './product'

// Owner decision 27 Sep 2026 (UAT4 consultative-40 A/B): Consultative V1 is ON by default.
describe('CONSULTATIVE_V1 default', () => {
  it('is ON when unset or empty, and for 1 / true', () => {
    for (const v of [undefined, '', '1', 'true', 'TRUE', ' on ']) expect(consultativeV1Enabled({ CONSULTATIVE_V1: v } as unknown as NodeJS.ProcessEnv), String(v)).toBe(true)
  })
  it('is OFF only when explicitly switched off', () => {
    for (const v of ['0', 'false', 'off', ' OFF ', 'False']) expect(consultativeV1Enabled({ CONSULTATIVE_V1: v } as unknown as NodeJS.ProcessEnv), v).toBe(false)
  })
})

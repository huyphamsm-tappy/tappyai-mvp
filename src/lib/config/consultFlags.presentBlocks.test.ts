// CONSULT_PRESENT_BLOCKS (layout slice 2, 14/11/2026): OFF by default, only the exact value "1", needs the one brain, and locked in a production runtime unless the owner names it in CONSULT_PRODUCTION_ALLOW.
import { describe, it, expect } from 'vitest'
import { consultPresentBlocksOn, CONSULT_PRESENT_BLOCKS_FLAG } from './consultFlags'

const PROD = { VERCEL_ENV: 'production', NODE_ENV: 'production' }
const ON = { CONSULT_ONE_BRAIN: '1', CONSULT_PRESENT_BLOCKS: '1' }

describe('consultPresentBlocksOn', () => {
  it('has the documented name', () => { expect(CONSULT_PRESENT_BLOCKS_FLAG).toBe('CONSULT_PRESENT_BLOCKS') })
  it('is off by default and for any value but exactly "1"', () => {
    expect(consultPresentBlocksOn({})).toBe(false)
    expect(consultPresentBlocksOn({ CONSULT_ONE_BRAIN: '1' })).toBe(false)
    for (const v of ['0', 'true', 'yes', ' 1', '1 ', '']) expect(consultPresentBlocksOn({ CONSULT_ONE_BRAIN: '1', CONSULT_PRESENT_BLOCKS: v })).toBe(false)
  })
  it('is on only with the one brain', () => {
    expect(consultPresentBlocksOn(ON)).toBe(true)
    expect(consultPresentBlocksOn({ CONSULT_PRESENT_BLOCKS: '1' })).toBe(false)
  })
  it('is locked in a production runtime, however it is set', () => {
    expect(consultPresentBlocksOn({ ...PROD, ...ON })).toBe(false)
    expect(consultPresentBlocksOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN' })).toBe(false)
  })
  it('opens in production only when the owner names it (and the one brain) in the allow list', () => {
    expect(consultPresentBlocksOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN CONSULT_PRESENT_BLOCKS' })).toBe(true)
    expect(consultPresentBlocksOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_PRESENT_BLOCKS' })).toBe(false)
    expect(consultPresentBlocksOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_PRESENT_BLOCKSX' })).toBe(false)
  })
})

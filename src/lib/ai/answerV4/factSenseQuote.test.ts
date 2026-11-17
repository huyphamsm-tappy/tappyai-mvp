import { describe, it, expect, vi, beforeEach } from 'vitest'

const extract = vi.fn()
vi.mock('@/lib/ai/llm', () => ({ AI: { extract: (...a: unknown[]) => extract(...a) } }))

import { checkClaimsWithModel } from './factSense'

const verdicts = (v: Array<{ n: number; supported: boolean; quote: string; kept_text?: string }>) => ({ object: { verdicts: v.map(x => ({ kept_text: '', ...x })) }, providerMetadata: undefined })

beforeEach(() => extract.mockReset())

// 18/11 review: "supported" with an EMPTY quote skipped the guard, so the code only verified a quote when the model chose to give one.
describe('with evidence in hand, support needs a quote that is in the evidence', () => {
  const evidence = 'Quán mở cửa từ 07:00 đến 22:00 hằng ngày.'
  it('a quote found in the evidence keeps the claim', async () => {
    extract.mockResolvedValue(verdicts([{ n: 1, supported: true, quote: 'mở cửa từ 07:00 đến 22:00' }]))
    expect(await checkClaimsWithModel(['Quán mở đến 22:00'], evidence)).toEqual([true])
  })
  it('"supported" with no quote is dropped', async () => {
    extract.mockResolvedValue(verdicts([{ n: 1, supported: true, quote: '' }]))
    expect(await checkClaimsWithModel(['Quán mở đến 22:00'], evidence)).toEqual([false])
  })
  it('a quote that is not in the evidence is dropped', async () => {
    extract.mockResolvedValue(verdicts([{ n: 1, supported: true, quote: 'mở đến 23:30 mỗi đêm' }]))
    expect(await checkClaimsWithModel(['Quán mở đến 22:00'], evidence)).toEqual([false])
  })
  it('with no evidence at all there is nothing to quote: the verdict stands', async () => {
    extract.mockResolvedValue(verdicts([{ n: 1, supported: true, quote: '' }]))
    expect(await checkClaimsWithModel(['Phở là món nước'], '')).toEqual([true])
  })
})

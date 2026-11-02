// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
// P0-1 closeout (owner decision 16/10): a brain answer that arrived is a decision, INVALID (never used, the route answers with its own
// fallback), or EMPTY (no decision = a failure, the guarded pipeline continues). runConsultBrain reports invalid answers via onInvalid.
import { describe, it, expect, vi } from 'vitest'
import { classifyConsultOutput, runConsultBrain } from './consultBrain'

describe('classifyConsultOutput', () => {
  it('a valid decision', () => {
    const r = classifyConsultOutput('{"turn":"pick","domains":["food"],"known":{},"assumptions":[]}')
    expect('decision' in r && r.decision.turn).toBe('pick')
  })
  it('empty / whitespace -> empty (no decision)', () => {
    for (const s of ['', '   ', '\n']) expect(classifyConsultOutput(s)).toEqual({ empty: true })
  })
  it('invalid answers and their reasons', () => {
    expect(classifyConsultOutput('Bạn nên đi Hồ Gươm.')).toEqual({ invalid: 'free_text' })
    expect(classifyConsultOutput('{"turn":"ask","domains":["food"]')).toEqual({ invalid: 'bad_json' })
    expect(classifyConsultOutput('{"turn": ask}')).toEqual({ invalid: 'bad_json' })
    expect(classifyConsultOutput('[1,2]{"x":1}')).toEqual({ invalid: 'bad_shape' })
    expect(classifyConsultOutput('{"turn":"sing"}')).toEqual({ invalid: 'bad_shape' })
    expect(classifyConsultOutput('{"domains":["food"]}')).toEqual({ invalid: 'bad_shape' })
    expect(classifyConsultOutput('{"turn":"pick","domains":["weapons"]}')).toEqual({ invalid: 'bad_domain' })
    expect(classifyConsultOutput('{"turn":"pick","domains":"food"}')).toEqual({ invalid: 'bad_domain' })
    expect(classifyConsultOutput('{"turn":"pick","domains":["food", 3]}')).toEqual({ invalid: 'bad_domain' })
  })
  it('an empty domain list is not invalid here (an ask without a domain gets the server domain question in the route)', () => {
    expect('decision' in classifyConsultOutput('{"turn":"chat","domains":[]}')).toBe(true)
  })
})

describe('runConsultBrain outcomes', () => {
  const ctx = (onInvalid?: (r: string) => void) => ({ hasGps: false, previousWasAsk: false, timeoutMs: 50, onInvalid })
  it('provider error -> null, not invalid', async () => {
    const onInvalid = vi.fn()
    expect(await runConsultBrain(() => Promise.reject(new Error('down')), [{ role: 'user', content: 'x' }], ctx(onInvalid))).toBeNull()
    expect(onInvalid).not.toHaveBeenCalled()
  })
  it('timeout -> null, not invalid', async () => {
    const onInvalid = vi.fn()
    expect(await runConsultBrain(() => new Promise(() => {}), [{ role: 'user', content: 'x' }], ctx(onInvalid))).toBeNull()
    expect(onInvalid).not.toHaveBeenCalled()
  })
  it('empty answer -> null, not invalid', async () => {
    const onInvalid = vi.fn()
    expect(await runConsultBrain(() => Promise.resolve({ text: ' ' }), [{ role: 'user', content: 'x' }], ctx(onInvalid))).toBeNull()
    expect(onInvalid).not.toHaveBeenCalled()
  })
  it('invalid answer -> null AND onInvalid(reason)', async () => {
    const onInvalid = vi.fn()
    expect(await runConsultBrain(() => Promise.resolve({ text: 'free text' }), [{ role: 'user', content: 'x' }], ctx(onInvalid))).toBeNull()
    expect(onInvalid).toHaveBeenCalledWith('free_text')
  })
  it('valid answer -> the decision', async () => {
    const r = await runConsultBrain(() => Promise.resolve({ text: '{"turn":"pick","domains":["food"],"known":{},"assumptions":[]}' }), [{ role: 'user', content: 'x' }], ctx())
    expect(r?.decision.turn).toBe('pick')
  })
})

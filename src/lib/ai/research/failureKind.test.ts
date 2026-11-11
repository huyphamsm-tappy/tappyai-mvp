import { describe, it, expect } from 'vitest'
import { failureKind } from './failureKind'
import { runDeepResearch, type DeepResearchDeps } from './deepResearch'

// A model call whose answer did not match the schema was logged as one generic line (11/11, the owner's UAT: the plan call and then the forecast-inputs call failed with nothing to say why). This reads the
// KIND of failure - the error name, how the answer ended (length = cut off), how long it was, and which fields the schema refused - and never the text of the answer or any value in it.

const noObject = (extra: Record<string, unknown> = {}) => Object.assign(new Error('No object generated: response did not match schema.'), { name: 'AI_NoObjectGeneratedError', ...extra })

describe('the engine says why there is no plan', () => {
  const run = (plan: DeepResearchDeps['plan']) => {
    const traces: Array<Record<string, unknown>> = []
    const deps: DeepResearchDeps = { plan, async gather() { return [] }, async notes() { return [] }, async *write() { yield 'x' }, trace: e => { traces.push(e) } }
    return runDeepResearch('q', '', 'vi', deps, { status() {}, text() {} }).then(out => ({ out, traces }))
  }
  it('a plan call that throws: no_plan, and a plan_error trace with the failure kind (never the text)', async () => {
    const { out, traces } = await run(async () => { throw noObject({ finishReason: 'length', text: 'SECRET '.repeat(50) }) })
    expect(out.failed).toBe('no_plan')
    const t = traces.find(x => x.ev === 'plan_error')!
    expect(t.name).toBe('AI_NoObjectGeneratedError')
    expect(t.finishReason).toBe('length')
    expect(JSON.stringify(t)).not.toContain('SECRET')
  })
  it('a plan with no usable step: no_plan, and a no_plan trace', async () => {
    const { out, traces } = await run(async () => ({ title: 'T', steps: [] }))
    expect(out.failed).toBe('no_plan')
    expect(traces.some(x => x.ev === 'no_plan')).toBe(true)
    expect(traces.some(x => x.ev === 'plan_error')).toBe(false)
  })
})

describe('failureKind', () => {
  it('names the error, how the answer ended and its length', () => {
    const k = failureKind(noObject({ finishReason: 'length', text: 'x'.repeat(1234) }))
    expect(k.name).toBe('AI_NoObjectGeneratedError')
    expect(k.finishReason).toBe('length')
    expect(k.textChars).toBe(1234)
    expect(k.message).toContain('did not match schema')
  })
  it('lists the fields the schema refused, found in the cause chain, with the kind of problem and no values', () => {
    const cause = { name: 'AI_TypeValidationError', cause: { issues: [{ path: ['volume', 'basis'], code: 'invalid_value', received: 'guess' }, { path: ['years', 0], code: 'invalid_type', expected: 'number', received: 'string' }] } }
    const k = failureKind(noObject({ cause }))
    expect(k.issues).toEqual(['volume.basis:invalid_value', 'years.0:invalid_type(number)'])
    expect(JSON.stringify(k)).not.toContain('guess')
  })
  it('never carries the answer\'s own text', () => {
    const k = failureKind(noObject({ text: 'SECRET-ANSWER-TEXT '.repeat(20), cause: { cause: { issues: [{ path: ['a'], code: 'x', message: 'SECRET-ISSUE-MESSAGE' }] } } }))
    expect(JSON.stringify(k)).not.toContain('SECRET')
  })
  it('at most 8 issues, and a plain error or a non-error is still described, never thrown', () => {
    const many = { issues: Array.from({ length: 20 }, (_, i) => ({ path: [`f${i}`], code: 'invalid_type' })) }
    expect(failureKind(noObject({ cause: many })).issues).toHaveLength(8)
    expect(failureKind(new Error('boom')).name).toBe('Error')
    expect(failureKind('just a string').name).toBe('unknown')
    expect(failureKind(null).name).toBe('unknown')
  })
  it('a long first line of the message is cut', () => {
    expect(failureKind(new Error('y'.repeat(500))).message.length).toBeLessThanOrEqual(120)
  })
})

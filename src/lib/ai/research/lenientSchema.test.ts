import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { lenientArray } from './lenientSchema'
import { PlanSchema, PlanSchemaPackages, GapsSchema, ForecastSpecSchema } from './deepResearchDeps'

// Measured 11/11, the M1 baseline run: of nine Advanced plan calls, three attempts failed, for two reasons seen in the failure log (field paths only): Sonnet returned `parts`, `steps` and `specialist_steps` as
// something that is not an array (twice, on the same question, so the retry did not help), and left out `image_query` on every step (once; the retry saved that run). The schema was stricter than the
// model's habits; it now accepts an array written as a JSON string, an absent optional list, and an absent image_query. What the model is TOLD (the JSON schema) is unchanged.

const step = { title: 'Quy mô', queries: ['q1', 'q2'], image_query: null }
const plan = { title: 'T', sources_label: 'Nguồn', parts: [{ part: 'a', step: 1 }], steps: [step], specialist_steps: [step] }

describe('lenientArray', () => {
  const s = lenientArray(z.number())
  it('a real array is unchanged', () => { expect(s.parse([1, 2])).toEqual([1, 2]) })
  it('an array written as a JSON string is read', () => { expect(s.parse('[1, 2]')).toEqual([1, 2]) })
  it('an absent or null list is empty', () => { expect(s.parse(undefined)).toEqual([]); expect(s.parse(null)).toEqual([]) })
  it('a string that is not JSON, or JSON that is not an array, is refused', () => {
    expect(s.safeParse('not json').success).toBe(false)
    expect(s.safeParse('{"a":1}').success).toBe(false)
    expect(s.safeParse('7').success).toBe(false)
  })
  it('the elements are still checked', () => { expect(s.safeParse(['x']).success).toBe(false); expect(s.safeParse('["x"]').success).toBe(false) })
  it('a required list stays required: absent is refused', () => {
    const r = lenientArray(z.number(), { required: true })
    expect(r.safeParse(undefined).success).toBe(false)
    expect(r.parse('[3]')).toEqual([3])
  })
})

describe('the plan schema', () => {
  it('accepts the plan as written, and with parts, steps and specialist steps as JSON strings (the q07 failure)', () => {
    expect(PlanSchema.safeParse(plan).success).toBe(true)
    const asStrings = { ...plan, parts: JSON.stringify(plan.parts), steps: JSON.stringify(plan.steps), specialist_steps: JSON.stringify(plan.specialist_steps) }
    const r = PlanSchema.safeParse(asStrings)
    expect(r.success).toBe(true)
    if (r.success) { expect(Array.isArray(r.data.steps)).toBe(true); expect(r.data.steps).toHaveLength(1); expect(r.data.steps[0].title).toBe('Quy mô') }
  })
  it('accepts steps with no image_query at all (the q08 failure), with null, and with a string', () => {
    const noImage = { title: 'S', queries: ['q'] }
    expect(PlanSchema.safeParse({ ...plan, steps: [noImage], specialist_steps: [noImage] }).success).toBe(true)
    expect(PlanSchema.safeParse({ ...plan, steps: [{ ...noImage, image_query: null }] }).success).toBe(true)
    expect(PlanSchema.safeParse({ ...plan, steps: [{ ...noImage, image_query: 'ảnh' }] }).success).toBe(true)
  })
  it('an absent list of specialist steps or parts is empty, but a plan with no steps field is refused (so the retry runs)', () => {
    const { specialist_steps: _s, parts: _p, ...rest } = plan
    void _s; void _p
    expect(PlanSchema.safeParse(rest).success).toBe(true)
    const { steps: _st, ...noSteps } = plan
    void _st
    expect(PlanSchema.safeParse(noSteps).success).toBe(false)
  })
  it('the package plan has the same leniency, and still needs the four parts on every step', () => {
    const full = { ...step, objective: 'o', output: 'x', sources: 's', boundary: 'b' }
    const base = { title: 'T', sources_label: 'N', parts: [], steps: JSON.stringify([full]), specialist_steps: '[]' }
    expect(PlanSchemaPackages.safeParse(base).success).toBe(true)
    expect(PlanSchemaPackages.safeParse({ ...base, steps: JSON.stringify([step]) }).success).toBe(false)
  })
  it('what the model is told is unchanged: the JSON schema still says array for the lists, and image_query is not required', () => {
    const js = zodToJsonSchema(PlanSchema, { $refStrategy: 'none' }) as { properties: Record<string, { type?: string; items?: { required?: string[] } }>; required?: string[] }
    expect(js.properties.steps.type).toBe('array')
    expect(js.properties.parts.type).toBe('array')
    expect(js.properties.specialist_steps.type).toBe('array')
    expect(js.properties.steps.items!.required).not.toContain('image_query')
    expect(js.required).toContain('steps')
  })
})

describe('the gap schema and the forecast inputs schema', () => {
  it('the gap check accepts its steps as a JSON string and a follow-up with no completes_step', () => {
    expect(GapsSchema.safeParse({ steps: JSON.stringify([{ title: 'a', queries: ['q'] }]) }).success).toBe(true)
    expect(GapsSchema.safeParse({ steps: [{ title: 'a', queries: ['q'], completes_step: 2 }] }).success).toBe(true)
    expect(GapsSchema.safeParse({}).success).toBe(true)
  })
  it('the forecast inputs accept the years as a JSON string', () => {
    const rate = { low: -1, base: 1.5, high: 3, basis: 'assumption' as const, note: 'n' }
    const spec = { unit: 'u', baseYear: 2026, base: { value: 100, source: 1, scope: 's' }, years: '[2027, 2028]', volume: rate, price: rate }
    const r = ForecastSpecSchema.safeParse(spec)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.years).toEqual([2027, 2028])
    expect(ForecastSpecSchema.safeParse({ ...spec, years: undefined }).success).toBe(false)
  })
})

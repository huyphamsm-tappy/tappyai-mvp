import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'
import { zodSchema } from 'ai'
import { repairArgs, repairToolCall, parseLooseNumber } from './toolCallRepair'

// E1 class (2026-09-18): an argument the SDK rejects ends the stream. The repair hook fixes the
// SHAPE from the tool's own JSON schema and logs every change; unrepairable calls are logged too.
const schema = zodSchema(z.object({
  query: z.string(),
  type: z.string().optional(),
  passengers: z.number().int().optional(),
  target_price: z.number(),
  flag: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
})).jsonSchema

describe('parseLooseNumber', () => {
  it('reads plain, Vietnamese-formatted and suffixed numbers', () => {
    expect(parseLooseNumber(9)).toBe(9)
    expect(parseLooseNumber('9')).toBe(9)
    expect(parseLooseNumber('2.000.000')).toBe(2_000_000)
    expect(parseLooseNumber('2,000,000')).toBe(2_000_000)
    expect(parseLooseNumber('1,5tr')).toBe(1_500_000)
    expect(parseLooseNumber('500k')).toBe(500_000)
    expect(parseLooseNumber('hai triệu')).toBeNull()
    expect(parseLooseNumber(null)).toBeNull()
  })
})

describe('repairArgs', () => {
  it('drops null optionals, stringifies numbers for string fields, parses numbers for number fields', () => {
    const r = repairArgs('t', { query: 'x', type: null, passengers: '10', target_price: '2.000.000', flag: 'yes', tags: 'a' }, schema)
    expect(r.args).toEqual({ query: 'x', passengers: 10, target_price: 2_000_000, flag: true, tags: ['a'] })
    expect(r.changed.map(c => c.how)).toEqual(['null_optional_dropped', 'to_number', 'to_number', 'to_boolean', 'to_array'])
  })
  it('a number where a string is expected becomes the string (type: 123 → "123")', () => {
    const r = repairArgs('t', { query: 123, type: 42 }, schema)
    expect(r.args).toEqual({ query: '123', type: '42' })
  })
  it('an unparseable OPTIONAL number is dropped; a required one is left for the SDK to reject', () => {
    expect(repairArgs('t', { query: 'x', passengers: 'nhiều', target_price: 1 }, schema).args).toEqual({ query: 'x', target_price: 1 })
    const r = repairArgs('t', { query: 'x', target_price: 'hai triệu' }, schema)
    expect(r.args.target_price).toBe('hai triệu')
    expect(r.changed).toEqual([])
  })
  it('a null REQUIRED field is not dropped (the SDK must reject it visibly)', () => {
    const r = repairArgs('t', { query: null, target_price: 1 }, schema)
    expect(r.args.query).toBeNull()
    expect(r.changed).toEqual([])
  })
})

describe('repairToolCall (SDK hook)', () => {
  afterEach(() => vi.restoreAllMocks())
  const call = (args: string, toolName = 'search_places') => ({ toolCallType: 'function' as const, toolCallId: 'c1', toolName, args })
  const opts = (args: string, toolName?: string) => ({
    toolCall: call(args, toolName), tools: { search_places: {} }, parameterSchema: () => schema, error: { name: 'AI_InvalidToolArgumentsError', message: 'bad' },
  })
  it('returns the repaired call and logs the changes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await repairToolCall(opts(JSON.stringify({ query: 'q', type: null, target_price: '1.000' })))
    expect(JSON.parse(r!.args)).toEqual({ query: 'q', target_price: 1000 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('"outcome":"repaired"')
    expect(warn.mock.calls[0][0]).toContain('"field":"type"')
  })
  it('returns null (SDK error stands) and logs when nothing can be repaired, args are not JSON, or the tool is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await repairToolCall(opts(JSON.stringify({ query: 'q', target_price: 'hai triệu' })))).toBeNull()
    expect(await repairToolCall(opts('{not json'))).toBeNull()
    expect(await repairToolCall(opts('{}', 'no_such_tool'))).toBeNull()
    expect(warn.mock.calls.map(c => JSON.parse(c[0] as string).outcome)).toEqual(['unrepairable', 'args_not_json', 'no_such_tool'])
  })
})

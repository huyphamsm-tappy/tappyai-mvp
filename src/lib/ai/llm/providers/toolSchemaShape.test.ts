import { describe, it, expect } from 'vitest'
import { zodSchema } from 'ai'
import { z } from 'zod'
import type { JSONSchema7 } from '@ai-sdk/provider'
import { repairArgs, type JsonSchemaLike } from '../toolCallRepair'

// ── 1.5: the repair hook's structural schema type vs the vendor's ───────────────────────────
//
// WHY THIS FILE LIVES IN providers/
// `toolCallRepair.ts` types its schema structurally (`JsonSchemaLike`) because
// `no-vendor-sdk-imports` (scripts/architecture/check.mjs) allows a vendor import only under
// src/lib/ai/llm/providers/. The compatibility check therefore sits here, and the rule is not
// weakened for it.
//
// 🚨 WHAT A COMPILE-TIME ASSERTION CAN AND CANNOT PROVE HERE. `@ai-sdk/provider` re-exports
// `JSONSchema7` from the `json-schema` package, whose typings (`@types/json-schema`) are NOT
// installed in this repo — so at the pinned versions the vendor type resolves to `any` and any
// assignability assertion against it is vacuous (verified 2026-09-19: narrowing `JsonSchemaLike`
// produced no tsc error). The assertion that carries weight is therefore RUNTIME, against the
// schema the SDK really produces for a zod tool definition (`zodSchema(...).jsonSchema`, the same
// conversion `tool()` uses), and the assumed shape is pinned below by version.
//
// Pinned vendor shape — ai 4.3.19 / @ai-sdk/provider 1.1.3 / zod-to-json-schema draft-07:
//   type: string | string[] · properties: Record<string, schema | boolean> · required: string[]
//   anyOf / oneOf: Array<schema | boolean>  — the five fields the hook reads, nothing else.
// A vendor upgrade that changes one of them fails the runtime test below.

/** Assignability in the direction the hook needs (compiles today because the vendor type is `any`). */
const asHook = (s: JSONSchema7): JsonSchemaLike => s

const TOOL = z.object({
  query: z.string(),
  passengers: z.number().int().optional(),
  mode: z.enum(['intercity', 'taxi']).optional(),
  tags: z.array(z.string()).optional(),
  flag: z.boolean().optional(),
})

describe('the JSON schema the AI SDK builds for a zod tool has the shape the repair hook reads', () => {
  const schema = zodSchema(TOOL).jsonSchema as JSONSchema7
  const hook = asHook(schema)

  it('type / properties / required are the pinned shapes', () => {
    expect(hook.type).toBe('object')
    expect(hook.required).toEqual(['query'])
    expect(hook.properties && typeof hook.properties).toBe('object')
    const props = hook.properties as Record<string, JsonSchemaLike>
    expect(props.query.type).toBe('string')
    expect(props.passengers.type).toBe('integer')
    expect(props.mode.type).toBe('string')
    expect(props.tags.type).toBe('array')
    expect(props.flag.type).toBe('boolean')
    for (const p of Object.values(props)) expect(typeof p.type === 'string' || Array.isArray(p.type)).toBe(true)
  })

  it('the hook repairs against that real schema exactly as its unit tests assume', () => {
    const { args, changed } = repairArgs('t', { query: 42, passengers: '2.000', flag: 'có', tags: 'x', mode: null }, hook)
    expect(args).toEqual({ query: '42', passengers: 2000, flag: true, tags: ['x'] })
    expect(changed.map(c => c.how)).toEqual(['to_string', 'to_number', 'to_boolean', 'to_array', 'null_optional_dropped'])
  })
})

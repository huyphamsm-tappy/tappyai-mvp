// ── Tool-call repair: an argument the model got wrong never kills the stream ─────────────────
//
// The AI SDK validates tool arguments against the zod schema BEFORE execute() runs; a failure
// ends the whole turn with `3:"An error occurred."` (measured E1 2026-09-18: `type:"entertainment"`
// outside an enum, four runs in a row). Per-tool tolerance (placeType.ts, transportMode.ts) covers
// the values a tool knows how to read; this covers the SHAPE mistakes any tool can get —
// `null` for an optional field, a number where a string is expected, "2.000.000" where a number
// is — in one place, from the tool's own JSON schema. Every repair is logged with the tool, the
// field, the value before and after; a call that cannot be repaired is logged and returned to
// the SDK unchanged (it then fails as before — visibly, not silently).

/**
 * The slice of a JSON Schema this file reads. Structural on purpose: the vendor SDK's
 * `JSONSchema7` type lives behind the provider layer (architecture rule
 * `no-vendor-sdk-imports`), and the SDK hands the schema in as a plain object anyway.
 */
export interface JsonSchemaLike {
  type?: string | string[]
  properties?: Record<string, JsonSchemaLike | boolean>
  required?: string[]
  anyOf?: Array<JsonSchemaLike | boolean>
  oneOf?: Array<JsonSchemaLike | boolean>
}

export interface RepairLog { tool: string; field: string; from: unknown; to: unknown; how: string }

const prop = (schema: JsonSchemaLike, key: string): JsonSchemaLike | null => {
  const p = schema.properties?.[key]
  return p && typeof p === 'object' ? p : null
}
const typeOf = (s: JsonSchemaLike): string[] => (Array.isArray(s.type) ? s.type : s.type ? [s.type] : (s.anyOf ?? s.oneOf ?? []).flatMap((x) => (typeof x === 'object' && x.type ? (Array.isArray(x.type) ? x.type : [x.type]) : [])))

/** A number written the Vietnamese way ("2.000.000", "1,5tr", "500k") or plainly. */
export function parseLooseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  const m = /^([\d.,]+)(k|tr|trieu|triệu|m)?$/.exec(s)
  if (!m) return null
  let n: number
  const digits = m[1]
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) n = Number(digits.replace(/\./g, ''))
  else if (/^\d{1,3}(,\d{3})+$/.test(digits)) n = Number(digits.replace(/,/g, ''))
  else n = Number(digits.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const mult = m[2] === 'k' ? 1e3 : (m[2] === 'tr' || m[2] === 'trieu' || m[2] === 'triệu' || m[2] === 'm') ? 1e6 : 1
  return n * mult
}

/**
 * Coerces `args` toward `schema` field by field. Returns the repaired args and what changed;
 * `changed` empty means nothing could be done.
 */
export function repairArgs(tool: string, args: Record<string, unknown>, schema: JsonSchemaLike): { args: Record<string, unknown>; changed: RepairLog[] } {
  const out: Record<string, unknown> = { ...args }
  const changed: RepairLog[] = []
  const required = new Set(schema.required ?? [])
  for (const [key, value] of Object.entries(args)) {
    const p = prop(schema, key)
    if (!p) continue // unknown key: zod strips it, harmless
    const types = typeOf(p)
    if (value === null || value === undefined) {
      if (!required.has(key)) { delete out[key]; changed.push({ tool, field: key, from: value, to: undefined, how: 'null_optional_dropped' }) }
      continue
    }
    if (types.includes('string') && typeof value !== 'string') {
      const to = typeof value === 'object' ? JSON.stringify(value) : String(value)
      out[key] = to; changed.push({ tool, field: key, from: value, to, how: 'to_string' })
      continue
    }
    if ((types.includes('number') || types.includes('integer')) && typeof value !== 'number') {
      const n = parseLooseNumber(value)
      if (n !== null) {
        const to = types.includes('integer') && !types.includes('number') ? Math.round(n) : n
        out[key] = to; changed.push({ tool, field: key, from: value, to, how: 'to_number' })
      } else if (!required.has(key)) {
        delete out[key]; changed.push({ tool, field: key, from: value, to: undefined, how: 'unparseable_optional_dropped' })
      }
      continue
    }
    if (types.includes('boolean') && typeof value !== 'boolean') {
      const s = String(value).trim().toLowerCase()
      if (['true', '1', 'yes', 'co', 'có'].includes(s)) { out[key] = true; changed.push({ tool, field: key, from: value, to: true, how: 'to_boolean' }) }
      else if (['false', '0', 'no', 'khong', 'không'].includes(s)) { out[key] = false; changed.push({ tool, field: key, from: value, to: false, how: 'to_boolean' }) }
      continue
    }
    if (types.includes('array') && !Array.isArray(value)) {
      out[key] = [value]; changed.push({ tool, field: key, from: value, to: [value], how: 'to_array' })
    }
  }
  return { args: out, changed }
}

/** The `experimental_repairToolCall` hook for streamText / generateText. */
export async function repairToolCall(options: {
  toolCall: { toolCallType: 'function'; toolCallId: string; toolName: string; args: string }
  tools: Record<string, unknown>
  parameterSchema: (o: { toolName: string }) => JsonSchemaLike
  error: { name?: string; message?: string }
}) {
  const { toolCall } = options
  const base = { type: 'tappyai_tool_repair', tool: toolCall.toolName, error: options.error?.name ?? 'unknown' }
  if (!(toolCall.toolName in options.tools)) {
    console.warn(JSON.stringify({ ...base, outcome: 'no_such_tool' }))
    return null
  }
  let parsed: unknown
  try { parsed = JSON.parse(toolCall.args) } catch {
    console.warn(JSON.stringify({ ...base, outcome: 'args_not_json', args: toolCall.args.slice(0, 200) }))
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(JSON.stringify({ ...base, outcome: 'args_not_object' }))
    return null
  }
  const schema = options.parameterSchema({ toolName: toolCall.toolName })
  const { args, changed } = repairArgs(toolCall.toolName, parsed as Record<string, unknown>, schema)
  if (changed.length === 0) {
    console.warn(JSON.stringify({ ...base, outcome: 'unrepairable', message: String(options.error?.message ?? '').slice(0, 200) }))
    return null
  }
  console.warn(JSON.stringify({ ...base, outcome: 'repaired', changes: changed }))
  return { ...toolCall, args: JSON.stringify(args) }
}

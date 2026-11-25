// Test support only (imported by *.test.ts, never by the app): a small JSON Schema checker for the subset the catalog publishes (type, enum, properties, required, additionalProperties, items, maxItems, anyOf,
// minLength/maxLength, minimum/maximum, pattern). ajv is only a transitive dependency of the repo, so it is not imported.
export function validateJsonSchema(schema: Record<string, unknown>, value: unknown, path = '$'): string[] {
  const errs: string[] = []
  const s = schema as {
    type?: string; enum?: unknown[]; properties?: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties?: boolean; items?: Record<string, unknown>
    maxItems?: number; anyOf?: Array<Record<string, unknown>>; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; pattern?: string
  }
  if (s.anyOf) return s.anyOf.some(sub => validateJsonSchema(sub, value, path).length === 0) ? [] : [`${path}: matches none of anyOf`]
  if (s.type) {
    const ok = s.type === 'null' ? value === null : s.type === 'array' ? Array.isArray(value) : s.type === 'integer' ? Number.isInteger(value) : s.type === 'object' ? !!value && typeof value === 'object' && !Array.isArray(value) : typeof value === s.type
    if (!ok) return [`${path}: expected ${s.type}`]
  }
  if (s.enum && !s.enum.includes(value)) errs.push(`${path}: not in enum`)
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) errs.push(`${path}: too short`)
    if (s.maxLength !== undefined && value.length > s.maxLength) errs.push(`${path}: too long`)
    if (s.pattern && !new RegExp(s.pattern).test(value)) errs.push(`${path}: pattern`)
  }
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) errs.push(`${path}: below minimum`)
    if (s.maximum !== undefined && value > s.maximum) errs.push(`${path}: above maximum`)
  }
  if (Array.isArray(value)) {
    if (s.maxItems !== undefined && value.length > s.maxItems) errs.push(`${path}: too many items`)
    if (s.items) value.forEach((v, i) => errs.push(...validateJsonSchema(s.items as Record<string, unknown>, v, `${path}[${i}]`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    for (const r of s.required ?? []) if (!(r in o)) errs.push(`${path}.${r}: required`)
    for (const [k, v] of Object.entries(o)) {
      if (s.properties && k in s.properties) errs.push(...validateJsonSchema(s.properties[k], v, `${path}.${k}`))
      else if (s.additionalProperties === false) errs.push(`${path}.${k}: not allowed`)
    }
  }
  return errs
}

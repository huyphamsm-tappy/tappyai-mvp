// TVI · the content hash of a fact version and the key of an entity. Pure (node:crypto only).
//
// The hash is what makes a re-ingest of the same fact a no-op (R13 ADR-019 / ADR-033): two versions with the same meaning must hash the same, whatever order their
// object keys came in. Only the CONTENT is hashed (fact type, subject, value, unit): when the page was read, the source and the evidence are not part of it.

import { createHash } from 'node:crypto'
import { normalizeVietnamese } from '@/lib/chat/workspace/historyModel'

/** JSON with object keys sorted at every depth, and no whitespace. undefined object members are dropped, like JSON.stringify does. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v === undefined ? null : v)).join(',')}]`
  const obj = value as Record<string, unknown>
  const parts: string[] = []
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
  }
  return `{${parts.join(',')}}`
}

export function contentHashOf(input: { factType: string; subjectKey?: string; value: unknown; valueUnit?: string | null }): string {
  const body = canonicalJson({ t: input.factType, s: input.subjectKey ?? '', v: input.value, u: input.valueUnit ?? null })
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

const slug = (s: string) => normalizeVietnamese(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * A stable key for a place: the provider's own id when there is one (`place:<id>`), else its normalised name and city (`place:name:<name>|<city>`), so "Quán Ăn Ngon"
 * and "quan an ngon" in the same city are one entity. Returns null when there is nothing to key on.
 */
export function placeEntityKey(p: { placeId?: string | null; name?: string | null; city?: string | null }): string | null {
  const id = (p.placeId ?? '').trim()
  if (id) return `place:${id}`.slice(0, 200)
  const name = slug(p.name ?? '')
  if (!name) return null
  const city = slug(p.city ?? '')
  return `place:name:${name}|${city}`.slice(0, 200)
}

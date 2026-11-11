// The published tool catalog (connector doc §12, R13 §25.6): the six initial tools plus the four fallback job tools used because MCP Tasks is not negotiated (§13.6).
// ONE field table per tool builds BOTH the JSON Schema a Host sees and the validator the Gateway runs, so the two cannot drift apart.
//
// 🚨 The schemas are DRAFT v0.1: the connector doc calls its example input "illustrative" and says final schemas wait for the Source Audit and contract testing. They are inferred from
// connector doc §12.4 and connectorContract.ts and have NOT been approved by the owner or exercised against any Host. Additive optional fields only until they are frozen.
// Deadlines are conservative PLACEHOLDERS, not measured SLAs (no fixed 3/5/8 s claim before a benchmark, connector doc §13.3).
import { z } from 'zod'
import { CONNECTOR_TOOLS, type ToolName } from './connectorContract'

export const TOOL_CATALOG_VERSION = 'mcp-tools.v0.1-draft'

export type CatalogToolName = ToolName | 'create_itinerary_job' | 'get_itinerary_job_status' | 'get_itinerary_job_result' | 'cancel_itinerary_job'
export type ExecutionMode = 'SYNC' | 'ASYNC' | 'JOB_CONTROL'
export interface ToolAnnotations { readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: boolean }

type Field =
  | { kind: 'string'; max: number; min?: number; pattern?: string; enum?: readonly string[]; description: string }
  | { kind: 'number'; min: number; max: number; description: string }
  | { kind: 'integer'; min: number; max: number; description: string }
  | { kind: 'array'; of: Field; max: number; description: string }
type Fields = Record<string, { field: Field; required?: boolean }>

const str = (max: number, description: string, o: { min?: number; pattern?: string; enum?: readonly string[] } = {}): Field => ({ kind: 'string', max, description, ...o })
const R = (field: Field) => ({ field, required: true })
const O = (field: Field) => ({ field })

function zodOf(f: Field): z.ZodTypeAny {
  switch (f.kind) {
    case 'string': {
      if (f.enum) return z.enum(f.enum as [string, ...string[]])
      let s = z.string().trim().max(f.max)
      s = s.min(f.min ?? 1)
      if (f.pattern) s = s.regex(new RegExp(f.pattern))
      return s
    }
    case 'number': return z.number().min(f.min).max(f.max)
    case 'integer': return z.number().int().min(f.min).max(f.max)
    case 'array': return z.array(zodOf(f.of)).max(f.max)
  }
}
function jsonOf(f: Field): Record<string, unknown> {
  switch (f.kind) {
    case 'string': return f.enum ? { type: 'string', enum: [...f.enum], description: f.description } : { type: 'string', minLength: f.min ?? 1, maxLength: f.max, ...(f.pattern ? { pattern: f.pattern } : {}), description: f.description }
    case 'number': return { type: 'number', minimum: f.min, maximum: f.max, description: f.description }
    case 'integer': return { type: 'integer', minimum: f.min, maximum: f.max, description: f.description }
    case 'array': return { type: 'array', items: jsonOf(f.of), maxItems: f.max, description: f.description }
  }
}
function build(fields: Fields): { zod: z.ZodTypeAny; json: Record<string, unknown> } {
  const shape: Record<string, z.ZodTypeAny> = {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    const base = zodOf(v.field)
    shape[k] = v.required ? base : base.optional()
    properties[k] = jsonOf(v.field)
    if (v.required) required.push(k)
  }
  return { zod: z.object(shape).strict(), json: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false } }
}

const searchFields = (maxResults: number): Fields => ({
  query: R(str(200, 'What to look for, in the user\'s own words.')),
  location_query: O(str(200, 'City, district or place in Vietnam the user named. Never guess it.')),
  latitude: O({ kind: 'number', min: -90, max: 90, description: 'Latitude the user shared; send together with longitude.' }),
  longitude: O({ kind: 'number', min: -180, max: 180, description: 'Longitude the user shared; send together with latitude.' }),
  preferred_language: O(str(2, 'Answer language of the result labels.', { enum: ['vi', 'en'] })),
  currency: O(str(3, 'ISO 4217 display currency, for example VND.', { pattern: '^[A-Z]{3}$' })),
  search_radius_meters: O({ kind: 'integer', min: 100, max: 20_000, description: 'Search radius around the coordinates.' }),
  limit: O({ kind: 'integer', min: 1, max: maxResults, description: `How many results, at most ${maxResults}. Default 5.` }),
})
const DATE = '^\\d{4}-\\d{2}-\\d{2}$'
const JOB_ID = '^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
const itineraryFields: Fields = {
  destination: R(str(100, 'Destination in Vietnam, for example Hue.')),
  days: R({ kind: 'integer', min: 1, max: 7, description: 'Number of days.' }),
  interests: O({ kind: 'array', of: str(40, 'An interest, for example food or history.'), max: 5, description: 'Up to five interests.' }),
  preferred_language: O(str(2, 'Answer language.', { enum: ['vi', 'en'] })),
  currency: O(str(3, 'ISO 4217 display currency.', { pattern: '^[A-Z]{3}$' })),
}
const jobIdField: Fields = { job_id: R(str(64, 'The job_id returned when the job was created.', { pattern: JOB_ID })) }

export interface CatalogTool {
  name: CatalogToolName
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotations
  mode: ExecutionMode
  /** hard server deadline of one call (placeholder, see the header) */
  deadlineMs: number
  /** the connector-contract tool whose scope and ceilings this tool uses */
  contract: ToolName
  schema: z.ZodTypeAny
}

const SYNC_DEADLINE_MS = 12_000
const CONTROL_DEADLINE_MS = 5_000
const CONTROL_READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }

function def(name: CatalogToolName, o: { title: string; description: string; fields: Fields; annotations: ToolAnnotations; mode: ExecutionMode; deadlineMs: number; contract: ToolName }): CatalogTool {
  const { zod, json } = build(o.fields)
  return { name, title: o.title, description: o.description, inputSchema: json, annotations: o.annotations, mode: o.mode, deadlineMs: o.deadlineMs, contract: o.contract, schema: zod }
}
const search = (name: ToolName & keyof typeof CONNECTOR_TOOLS, title: string, description: string, extra: Fields = {}): CatalogTool =>
  def(name, { title, description, fields: { ...searchFields(CONNECTOR_TOOLS[name].maxResults), ...extra }, annotations: CONNECTOR_TOOLS[name].annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: name })

const ITINERARY_DESCRIPTION = 'Starts an itinerary job for a destination in Vietnam and returns a job handle immediately (job_id, status, poll_after_ms). It creates a job record; it does not book, buy or pay for anything. Poll get_itinerary_job_status, then read get_itinerary_job_result.'

export const CATALOG: Readonly<Record<CatalogToolName, CatalogTool>> = Object.freeze({
  search_places: search('search_places', 'Search places', 'Find places in Vietnam (cafes, services, spas and more) near a named destination or shared coordinates. Read-only.'),
  search_restaurants: search('search_restaurants', 'Search restaurants', 'Find restaurants and food places in Vietnam near a named destination or shared coordinates. Read-only.'),
  search_shopping: search('search_shopping', 'Search shopping', 'Find products and shops with listed prices. Read-only; prices are indicative and the merchant page is the source of truth.'),
  search_hotels: search('search_hotels', 'Search hotels', 'Find hotels in a Vietnamese destination with indicative prices. Read-only; it does not confirm room availability.', {
    check_in: O(str(10, 'Check-in date, YYYY-MM-DD.', { pattern: DATE })), check_out: O(str(10, 'Check-out date, YYYY-MM-DD.', { pattern: DATE })),
  }),
  search_attractions: search('search_attractions', 'Search attractions', 'Find attractions, entertainment and activities in Vietnam near a named destination or shared coordinates. Read-only.'),
  create_itinerary: def('create_itinerary', { title: 'Create itinerary', description: ITINERARY_DESCRIPTION, fields: itineraryFields, annotations: CONNECTOR_TOOLS.create_itinerary.annotations, mode: 'ASYNC', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  create_itinerary_job: def('create_itinerary_job', { title: 'Create itinerary job', description: ITINERARY_DESCRIPTION, fields: itineraryFields, annotations: CONNECTOR_TOOLS.create_itinerary.annotations, mode: 'ASYNC', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  get_itinerary_job_status: def('get_itinerary_job_status', { title: 'Itinerary job status', description: 'Reads the status of an itinerary job you created. Read-only.', fields: jobIdField, annotations: CONTROL_READ, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  get_itinerary_job_result: def('get_itinerary_job_result', { title: 'Itinerary job result', description: 'Reads the result of an itinerary job you created, once it has finished. Read-only.', fields: jobIdField, annotations: CONTROL_READ, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  cancel_itinerary_job: def('cancel_itinerary_job', { title: 'Cancel itinerary job', description: 'Asks for an itinerary job you created to stop. Cancellation is cooperative: work already under way may still finish.', fields: jobIdField, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
})

/** The catalog entry for a name, or null. Own properties only: '__proto__', 'constructor' and the like are not tools. Pure. */
export const catalogTool = (n: unknown): CatalogTool | null => (typeof n === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, n) ? CATALOG[n as CatalogToolName] : null)

export function listTools(): Array<{ name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: ToolAnnotations }> {
  return Object.values(CATALOG).map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { ...t.annotations, title: t.title } as ToolAnnotations }))
}

export type ParsedArgs = { ok: true; value: Record<string, unknown> } | { ok: false }

/** Strict validation of a tool's arguments: unknown keys, wrong types and out-of-range values are refused. Latitude and longitude come together or not at all. Pure. */
export function parseArgs(name: CatalogToolName, raw: unknown): ParsedArgs {
  const t = catalogTool(name)
  if (!t || !raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false }
  const r = t.schema.safeParse(raw)
  if (!r.success) return { ok: false }
  const v = r.data as Record<string, unknown>
  if (('latitude' in v) !== ('longitude' in v)) return { ok: false }
  return { ok: true, value: v }
}

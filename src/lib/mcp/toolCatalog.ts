// The published tool catalog (connector doc §12, R13 §25.6): the six initial tools plus the four fallback job tools used because MCP Tasks is not negotiated (§13.6).
// ONE field table per tool builds BOTH the JSON Schema a Host sees and the validator the Gateway runs, so the two cannot drift apart.
//
// v1.0 (12/11/2026), v1.1 (12/11/2026: additive optional output field action_links): the inputs follow connector doc §12.4 (illustrative example) and §7.2 (explicit context parameters: location_query, latitude, longitude, preferred_language, user_locale, currency,
// timezone, search_radius_meters), the outputs follow §14.1 (status, query_context, results, warnings, next_action) and §13.6 (job_id, status, created_at, poll_after_ms, expires_at). The doc says its example
// is not the approved schema, so this version is FROZEN BY THIS FILE'S OWN RULES, not by a Host or the owner's sign-off: it has not been exercised against any Host.
//
// VERSIONING POLICY (connector doc §12.5): additive OPTIONAL input fields and additive output fields are allowed within a major version; removing or renaming a field, tightening a bound, adding a required
// field or changing a type is breaking and needs a new major version, a migration note and the owner's approval. catalogFingerprint() is pinned by a test: any change to the published catalog fails it
// until the version and the pinned value are changed together on purpose. A Host may keep an older schema snapshot, so a change is never assumed to reach it at once.
// Deadlines are conservative PLACEHOLDERS, not measured SLAs (no fixed 3/5/8 s claim before a benchmark, connector doc §13.3).
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CONNECTOR_TOOLS, type ToolName } from './connectorContract'
import { TOOL_TEXT } from './tappyProfile'

// v1.2 (22/11/2026): DESCRIPTIONS ONLY (what Tappy has that a general AI does not: tappyProfile.ts). No field, bound or type changed, so it stays within major version 1.
// v1.3 (27/11/2026): ADDS the check_scam tool (Scam Shield's link check). A new tool changes no existing field, bound or type, so it stays within major version 1.
export const TOOL_CATALOG_VERSION = 'mcp-tools.v1.3'

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
  user_locale: O(str(20, 'The user\'s locale as a BCP 47 tag, for example vi-VN. Advisory: it never selects a location.', { pattern: '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$' })),
  currency: O(str(3, 'ISO 4217 display currency, for example VND.', { pattern: '^[A-Z]{3}$' })),
  timezone: O(str(64, 'IANA timezone of the user, for example Asia/Ho_Chi_Minh. Advisory: it never selects a location.', { pattern: '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' })),
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
/** Deals and clips take a plain ask, an optional limit and a language: no location, no author, no file. */
const dataFields = (what: string, maxResults: number): Fields => ({
  query: R(str(200, what)),
  preferred_language: O(str(2, 'Answer language of the result labels.', { enum: ['vi', 'en'] })),
  limit: O({ kind: 'integer', min: 1, max: maxResults, description: `How many results, at most ${maxResults}. Default 5.` }),
})
const coachFields: Fields = {
  origin: R(str(80, 'The place the user leaves from, in Vietnam, as they named it, for example Sài Gòn or Hà Nội.')),
  destination: R(str(80, 'The place the user is going to, in Vietnam, as they named it, for example Đà Lạt.')),
  depart_date: O(str(10, 'Day of travel, YYYY-MM-DD. Leave it out if the user did not say; the result states which day its link is for.', { pattern: DATE })),
  preferred_language: O(str(2, 'Answer language of the result labels.', { enum: ['vi', 'en'] })),
}
const scamFields: Fields = {
  url: R(str(2048, 'The website link to check, exactly as the user received it (a bare domain such as example.vn is fine). Never an address on a private network.')),
  preferred_language: O(str(2, 'Language of the verdict text.', { enum: ['vi', 'en'] })),
}

// ── output schemas (connector doc §14.1, §13.6) ──────────────────────────────────────────────────────────────────────────

const S = { type: 'string' } as const
const N = { type: 'number' } as const
/** The JSON type of every DTO field a result row may carry. A field of connectorContract's allowlist without an entry here is a bug (a test fails). */
export const DTO_FIELD_TYPES: Readonly<Record<string, Record<string, unknown>>> = Object.freeze({
  id: S, name: S, title: S, category: S, address: S, district: S, city: S, rating: N, priceLevel: S, openNow: { type: 'boolean' }, distanceMeters: N, url: S,
  cuisine: S, priceRange: S, openingHours: S, ticketPrice: { anyOf: [N, S] }, price: { anyOf: [N, S] }, currency: S, merchant: S, pricePerNight: N, stars: N,
  // check_scam
  target: S, verdict: { type: 'string', enum: ['familiar', 'suspicious', 'unrecognized'] }, verdictTitle: S, summary: S, signals: { type: 'array', maxItems: 6, items: S },
  resemblesBrand: S, officialSite: S, officialHotline: S, nextSteps: { type: 'array', maxItems: 4, items: S },
  // search_deals / search_clips
  partner: S, description: S, discount: S, voucherCode: S, endsAt: S, caption: S, thumbnail: S, likes: N, comments: N, createdAt: S,
  // search_coach
  route: S, departDate: S,
})
const rowSchema = (fields: readonly string[]) => ({ type: 'object', properties: Object.fromEntries(fields.map(f => [f, DTO_FIELD_TYPES[f] ?? { type: 'null' }])), additionalProperties: false })
const objectOf = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false })

const JOB_STATUS = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']
const JOB_VIEW_PROPS = { job_id: S, status: { type: 'string', enum: JOB_STATUS }, created_at: S, poll_after_ms: { type: 'integer' }, expires_at: S }
const JOB_VIEW_REQUIRED = ['job_id', 'status', 'created_at', 'poll_after_ms', 'expires_at']
const ITINERARY_SCHEMA = objectOf({ days: { type: 'array', maxItems: 7, items: objectOf({ day: { type: 'integer' }, items: { type: 'array', maxItems: 12, items: objectOf({ title: S, kind: { type: 'string', enum: ['attraction', 'restaurant', 'hotel'] }, url: S }, ['title', 'kind']) } }, ['day', 'items']) } }, ['days'])

/** Structured result of a SUCCESSFUL call (an error is an isError result with the error contract, not described here). */
function outputSchemaFor(name: CatalogToolName): Record<string, unknown> {
  switch (name) {
    case 'create_itinerary': case 'create_itinerary_job': case 'get_itinerary_job_status': case 'cancel_itinerary_job': return objectOf(JOB_VIEW_PROPS, JOB_VIEW_REQUIRED)
    case 'get_itinerary_job_result': return objectOf({ ...JOB_VIEW_PROPS, result: { anyOf: [{ type: 'null' }, ITINERARY_SCHEMA] } }, [...JOB_VIEW_REQUIRED, 'result'])
    default: {
      const c = CONNECTOR_TOOLS[name]
      return objectOf({
        status: { type: 'string', enum: ['success', 'partial'] },
        query_context: objectOf({ market: S, language: S, context_source: S, context_confidence: S, location_precision: S, needs_clarification: { type: 'boolean' } }, ['market', 'language', 'context_source', 'context_confidence', 'location_precision', 'needs_clarification']),
        results: { type: 'array', maxItems: c.maxResults, items: rowSchema(c.dtoFields) },
        warnings: { type: 'array', items: S },
        next_action: { type: 'null' },
        // additive in v1.1: present only when attribution is configured; the row's own url is unchanged
        action_links: { type: 'array', items: objectOf({ result_index: { type: 'integer' }, label: S, url: S }, ['result_index', 'label', 'url']) },
      }, ['status', 'query_context', 'results', 'warnings', 'next_action'])
    }
  }
}

export interface CatalogTool {
  name: CatalogToolName
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
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
  return { name, title: o.title, description: o.description, inputSchema: json, outputSchema: outputSchemaFor(name), annotations: o.annotations, mode: o.mode, deadlineMs: o.deadlineMs, contract: o.contract, schema: zod }
}
const search = (name: ToolName & keyof typeof CONNECTOR_TOOLS, title: string, description: string, extra: Fields = {}): CatalogTool =>
  def(name, { title, description, fields: { ...searchFields(CONNECTOR_TOOLS[name].maxResults), ...extra }, annotations: CONNECTOR_TOOLS[name].annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: name })

const ITINERARY_DESCRIPTION = 'Starts an itinerary job for a destination in Vietnam and returns a job handle immediately (job_id, status, poll_after_ms). It creates a job record; it does not book, buy or pay for anything. Poll get_itinerary_job_status, then read get_itinerary_job_result.'

export const CATALOG: Readonly<Record<CatalogToolName, CatalogTool>> = Object.freeze({
  search_places: search('search_places', 'Search places', TOOL_TEXT.search_places),
  search_restaurants: search('search_restaurants', 'Search restaurants', TOOL_TEXT.search_restaurants),
  search_shopping: search('search_shopping', 'Search shopping', TOOL_TEXT.search_shopping),
  search_hotels: search('search_hotels', 'Search hotels', TOOL_TEXT.search_hotels, {
    check_in: O(str(10, 'Check-in date, YYYY-MM-DD.', { pattern: DATE })), check_out: O(str(10, 'Check-out date, YYYY-MM-DD.', { pattern: DATE })),
  }),
  search_attractions: search('search_attractions', 'Search attractions', TOOL_TEXT.search_attractions),
  check_scam: def('check_scam', { title: 'Check a link for scams', description: TOOL_TEXT.check_scam, fields: scamFields, annotations: CONNECTOR_TOOLS.check_scam.annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: 'check_scam' }),
  search_deals: def('search_deals', { title: 'Search partner deals', description: TOOL_TEXT.search_deals, fields: dataFields('A partner or a kind of offer, for example Lazada, Grab, hotels or shopping. A general ask such as "deals" lists what is on now.', CONNECTOR_TOOLS.search_deals.maxResults), annotations: CONNECTOR_TOOLS.search_deals.annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: 'search_deals' }),
  search_clips: def('search_clips', { title: 'Search Tappy clips', description: TOOL_TEXT.search_clips, fields: dataFields('A dish, place or topic to find in public clips, in the user\'s own words, for example pho Ha Noi.', CONNECTOR_TOOLS.search_clips.maxResults), annotations: CONNECTOR_TOOLS.search_clips.annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: 'search_clips' }),
  search_coach: def('search_coach', { title: 'Find a coach booking page', description: TOOL_TEXT.search_coach, fields: coachFields, annotations: CONNECTOR_TOOLS.search_coach.annotations, mode: 'SYNC', deadlineMs: SYNC_DEADLINE_MS, contract: 'search_coach' }),
  create_itinerary: def('create_itinerary', { title: 'Create itinerary', description: ITINERARY_DESCRIPTION, fields: itineraryFields, annotations: CONNECTOR_TOOLS.create_itinerary.annotations, mode: 'ASYNC', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  create_itinerary_job: def('create_itinerary_job', { title: 'Create itinerary job', description: ITINERARY_DESCRIPTION, fields: itineraryFields, annotations: CONNECTOR_TOOLS.create_itinerary.annotations, mode: 'ASYNC', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  get_itinerary_job_status: def('get_itinerary_job_status', { title: 'Itinerary job status', description: 'Reads the status of an itinerary job you created. Read-only.', fields: jobIdField, annotations: CONTROL_READ, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  get_itinerary_job_result: def('get_itinerary_job_result', { title: 'Itinerary job result', description: 'Reads the result of an itinerary job you created, once it has finished. Read-only.', fields: jobIdField, annotations: CONTROL_READ, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
  cancel_itinerary_job: def('cancel_itinerary_job', { title: 'Cancel itinerary job', description: 'Asks for an itinerary job you created to stop. Cancellation is cooperative: work already under way may still finish.', fields: jobIdField, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, mode: 'JOB_CONTROL', deadlineMs: CONTROL_DEADLINE_MS, contract: 'create_itinerary' }),
})

/** The catalog entry for a name, or null. Own properties only: '__proto__', 'constructor' and the like are not tools. Pure. */
export const catalogTool = (n: unknown): CatalogTool | null => (typeof n === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, n) ? CATALOG[n as CatalogToolName] : null)

/**
 * Every tool that needs the persisted job store: create_itinerary starts a job exactly as create_itinerary_job does, so it goes with the four fallback job tools (a create tool whose status, result
 * and cancel tools are hidden would be a dead end). Owner decision D2 (27/11/2026): the long-running tools do not ship at launch. They are hidden, not deleted: the definitions below stay byte for byte. Pure.
 */
export const JOB_TOOLS: readonly CatalogToolName[] = Object.freeze(['create_itinerary', 'create_itinerary_job', 'get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job'] as const)
export const isJobTool = (n: unknown): boolean => typeof n === 'string' && (JOB_TOOLS as readonly string[]).includes(n)

/** `jobs` (default true: the whole catalog) is false when the job store is not available: then no job-dependent tool is listed. Pure. */
export interface ListOptions { jobs?: boolean }

export function listTools(opts: ListOptions = {}): Array<{ name: string; title: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>; annotations: ToolAnnotations }> {
  const jobs = opts.jobs !== false
  return Object.values(CATALOG).filter(t => jobs || !isJobTool(t.name)).map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema, annotations: { ...t.annotations, title: t.title } as ToolAnnotations }))
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
  if (name === 'search_hotels' && !validStay(v.check_in, v.check_out)) return { ok: false }
  return { ok: true, value: v }
}

/** Hotel dates: check_out needs check_in, both real calendar dates, check_out after check_in, at most 30 nights. Pure. */
function validStay(checkIn: unknown, checkOut: unknown): boolean {
  const day = (v: unknown): number | null => {
    if (typeof v !== 'string') return null
    const t = Date.parse(v + 'T00:00:00Z')
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? t : null
  }
  if (checkIn === undefined && checkOut === undefined) return true
  const a = day(checkIn)
  if (a === null) return false
  if (checkOut === undefined) return true
  const b = day(checkOut)
  return b !== null && b > a && (b - a) / 86_400_000 <= 30
}

/** A stable fingerprint of everything a Host can see of the catalog (names, descriptions, schemas, annotations, version). Pinned by a test: change the catalog on purpose, then change both together. */
export function catalogFingerprint(opts: ListOptions = {}): string {
  return createHash('sha256').update(JSON.stringify({ v: TOOL_CATALOG_VERSION, tools: listTools(opts) })).digest('hex')
}

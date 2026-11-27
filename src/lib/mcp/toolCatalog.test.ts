import { describe, it, expect } from 'vitest'
import { CATALOG, catalogFingerprint, catalogTool, isJobTool, JOB_TOOLS, listTools, parseArgs, TOOL_CATALOG_VERSION } from './toolCatalog'
import { CONNECTOR_TOOLS } from './connectorContract'
import { TOOL_SERVICE } from './serviceMap'

const SEARCH = ['search_places', 'search_restaurants', 'search_shopping', 'search_hotels', 'search_attractions'] as const

describe('tool catalog (schemas v1.1)', () => {
  it('publishes the six initial tools plus the four fallback job tools, and nothing else', () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...SEARCH, 'create_itinerary', 'create_itinerary_job', 'get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job'].sort())
    expect(listTools().length).toBe(10)
    expect(TOOL_CATALOG_VERSION).toBe('mcp-tools.v1.2')
  })
  it('jobs off: only the five searches are listed; every job-dependent tool (create_itinerary included) is hidden', () => {
    expect(listTools({ jobs: false }).map(t => t.name).sort()).toEqual([...SEARCH].sort())
    expect(listTools({ jobs: true }).length).toBe(10)
    expect(listTools().length).toBe(10)
    expect([...JOB_TOOLS].sort()).toEqual(['cancel_itinerary_job', 'create_itinerary', 'create_itinerary_job', 'get_itinerary_job_result', 'get_itinerary_job_status'])
    for (const n of JOB_TOOLS) expect(isJobTool(n)).toBe(true)
    for (const n of SEARCH) expect(isJobTool(n)).toBe(false)
    for (const n of ['__proto__', 'toString', 42, null, undefined]) expect(isJobTool(n)).toBe(false)
  })
  it('the job tool definitions are kept byte for byte: hiding them does not change the full catalog', () => {
    expect(catalogFingerprint()).toBe(catalogFingerprint({ jobs: true }))
    expect(catalogFingerprint({ jobs: false })).not.toBe(catalogFingerprint({ jobs: true }))
  })
  it('SYNC for the five searches, ASYNC for create_itinerary, JOB_CONTROL for the job tools', () => {
    for (const n of SEARCH) expect(CATALOG[n].mode).toBe('SYNC')
    expect(CATALOG.create_itinerary.mode).toBe('ASYNC')
    for (const n of ['create_itinerary_job', 'get_itinerary_job_status', 'get_itinerary_job_result', 'cancel_itinerary_job'] as const) expect(CATALOG[n].mode).toMatch(/ASYNC|JOB_CONTROL/)
  })
  it('annotations are honest: searches read-only; anything that creates or cancels a job is NOT read-only; nothing is destructive', () => {
    for (const n of SEARCH) expect(CATALOG[n].annotations.readOnlyHint).toBe(true)
    for (const n of ['create_itinerary', 'create_itinerary_job', 'cancel_itinerary_job'] as const) expect(CATALOG[n].annotations.readOnlyHint).toBe(false)
    expect(CATALOG.get_itinerary_job_status.annotations.readOnlyHint).toBe(true)
    expect(CATALOG.get_itinerary_job_result.annotations.readOnlyHint).toBe(true)
    for (const t of Object.values(CATALOG)) expect(t.annotations.destructiveHint).toBe(false)
  })
  it('the six initial tools agree with the connector contract (annotations)', () => {
    for (const n of [...SEARCH, 'create_itinerary'] as const) expect(CATALOG[n].annotations).toEqual(CONNECTOR_TOOLS[n].annotations)
  })
  it('every tool has a finite SYNC/ASYNC deadline and an object input schema that forbids extra properties', () => {
    for (const t of Object.values(CATALOG)) {
      expect(t.deadlineMs).toBeGreaterThan(0); expect(t.deadlineMs).toBeLessThan(60_000)
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
    }
  })
  it('JSON schema and the validator agree on required fields and on the property names', () => {
    for (const t of Object.values(CATALOG)) {
      const required = (t.inputSchema as { required?: string[] }).required ?? []
      const props = Object.keys((t.inputSchema as { properties: object }).properties)
      const sample: Record<string, unknown> = {}
      for (const r of required) sample[r] = r === 'days' ? 2 : r === 'job_id' ? 'job_00000000-0000-4000-8000-000000000000' : 'x'
      expect(parseArgs(t.name, sample).ok, t.name).toBe(true)
      for (const r of required) { const { [r]: _omit, ...rest } = sample; expect(parseArgs(t.name, rest).ok, `${t.name} without ${r}`).toBe(false) }
      expect(parseArgs(t.name, { ...sample, __extra: 1 }).ok, `${t.name} extra key`).toBe(false)
      expect(props.length).toBeGreaterThan(0)
    }
  })
  it('search input is bounded: limit above the tool ceiling, coordinates out of range or only one of them, huge text, bad currency are all rejected', () => {
    const ok = { query: 'pho' }
    expect(parseArgs('search_places', ok).ok).toBe(true)
    expect(parseArgs('search_places', { ...ok, limit: CONNECTOR_TOOLS.search_places.maxResults + 1 }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, limit: 0 }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, latitude: 91, longitude: 0 }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, latitude: 10 }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, latitude: 10.7, longitude: 106.7 }).ok).toBe(true)
    expect(parseArgs('search_places', { query: 'x'.repeat(500) }).ok).toBe(false)
    expect(parseArgs('search_places', { query: '' }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, currency: 'dong' }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, search_radius_meters: 10_000_000 }).ok).toBe(false)
    expect(parseArgs('search_places', { ...ok, limit: 1.5 }).ok).toBe(false)
    expect(parseArgs('search_places', { query: 42 }).ok).toBe(false)
    expect(parseArgs('search_places', null).ok).toBe(false)
  })
  it('create_itinerary input is bounded (days 1-7, short interest list, no side-effect fields)', () => {
    expect(parseArgs('create_itinerary', { destination: 'Hue', days: 3 }).ok).toBe(true)
    expect(parseArgs('create_itinerary', { destination: 'Hue', days: 30 }).ok).toBe(false)
    expect(parseArgs('create_itinerary', { destination: 'Hue', days: 3, interests: Array(20).fill('food') }).ok).toBe(false)
    expect(parseArgs('create_itinerary', { destination: 'Hue', days: 3, book: true }).ok).toBe(false)
  })
  it('hotel dates must be YYYY-MM-DD', () => {
    expect(parseArgs('search_hotels', { query: 'hotel', location_query: 'Da Nang', check_in: '2026-12-01', check_out: '2026-12-03' }).ok).toBe(true)
    expect(parseArgs('search_hotels', { query: 'hotel', check_in: '1/12/2026' }).ok).toBe(false)
  })
  it('catalogTool rejects names that are not own properties', () => {
    expect(catalogTool('search_places')?.name).toBe('search_places')
    for (const n of ['__proto__', 'toString', 'constructor', 'drop_table', 42, null]) expect(catalogTool(n)).toBeNull()
  })
})

describe('service allowlist: each search tool maps to one fixed internal service', () => {
  it('is frozen and covers exactly the five search tools', () => {
    expect(Object.keys(TOOL_SERVICE).sort()).toEqual([...SEARCH].sort())
    expect(Object.isFrozen(TOOL_SERVICE)).toBe(true)
    expect(TOOL_SERVICE.search_restaurants).toMatchObject({ service: 'places.search', placeType: 'restaurant' })
    expect(TOOL_SERVICE.search_attractions).toMatchObject({ service: 'places.search', placeType: 'attraction' })
    expect(TOOL_SERVICE.search_shopping.service).toBe('shopping.search')
    expect(TOOL_SERVICE.search_hotels.service).toBe('hotels.prices')
  })
})

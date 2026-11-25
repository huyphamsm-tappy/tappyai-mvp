import { describe, it, expect } from 'vitest'
import { CONNECTOR_TOOLS, admitToolCall, connectorLocation, shapeResult, spendPoolKeys, isToolName, type VerifiedClaims, type CallContext } from './connectorContract'

const NOW = new Date('2026-11-10T10:00:00Z')
const claims = (o: Partial<VerifiedClaims> = {}): VerifiedClaims => ({ audience: 'https://mcp.example.invalid', scopes: ['places:read', 'hotels:read', 'shopping:read', 'itinerary:create'], expiresAt: Math.floor(NOW.getTime() / 1000) + 600, revoked: false, host: 'claude', installId: 'inst-1', userId: 'u1', principalId: 'p1', ...o })
const call = (o: Partial<CallContext> = {}): CallContext => ({ claims: claims(), expectedAudience: 'https://mcp.example.invalid', now: NOW, toolName: 'search_places', spendPoolOk: true, ...o })

describe('the tool registry', () => {
  it('has exactly the six initial tools, all read-only except job creation which declares itself stateful and never destructive', () => {
    expect(Object.keys(CONNECTOR_TOOLS).sort()).toEqual(['create_itinerary', 'search_attractions', 'search_hotels', 'search_places', 'search_restaurants', 'search_shopping'])
    for (const t of Object.values(CONNECTOR_TOOLS)) {
      expect(t.annotations.destructiveHint).toBe(false)
      if (t.name === 'create_itinerary') { expect(t.stateful).toBe(true); expect(t.annotations.readOnlyHint).toBe(false) } else { expect(t.stateful).toBe(false); expect(t.annotations.readOnlyHint).toBe(true) }
    }
  })
  it('no tool is a booking, purchase, payment or account change, and no result field names an internal score', () => {
    for (const t of Object.values(CONNECTOR_TOOLS)) {
      expect(t.name).not.toMatch(/book|buy|purchase|pay|checkout|account|delete|update/i)
      for (const f of t.dtoFields) expect(f).not.toMatch(/score|rank|embedding|tvi|internal|secret|token/i)
    }
  })
  it('every tool has Top-K and byte ceilings; isToolName rejects anything else', () => {
    for (const t of Object.values(CONNECTOR_TOOLS)) { expect(t.maxResults).toBeGreaterThan(0); expect(t.maxResponseBytes).toBeGreaterThan(0) }
    expect(isToolName('search_places')).toBe(true); expect(isToolName('__proto__')).toBe(false); expect(isToolName('toString')).toBe(false); expect(isToolName('drop_table')).toBe(false)
  })
})

describe('admitToolCall: authentication and authorisation on every call', () => {
  it('a valid call is admitted with its tool contract', () => {
    const a = admitToolCall(call()); expect(a.ok).toBe(true)
    expect(a.ok && a.tool.name).toBe('search_places')
  })
  it('rejects, with a distinct reason: no token, wrong audience, revoked, expired', () => {
    expect(admitToolCall(call({ claims: null }))).toEqual({ ok: false, error: 'unauthenticated' })
    expect(admitToolCall(call({ claims: claims({ audience: 'https://other.invalid' }) }))).toEqual({ ok: false, error: 'wrong_audience' })
    expect(admitToolCall(call({ claims: claims({ revoked: true }) }))).toEqual({ ok: false, error: 'token_revoked' })
    expect(admitToolCall(call({ claims: claims({ expiresAt: Math.floor(NOW.getTime() / 1000) - 1 }) }))).toEqual({ ok: false, error: 'token_expired' })
  })
  it('an unknown tool and a missing scope are refused; a scope for one tool does not open another', () => {
    expect(admitToolCall(call({ toolName: 'book_hotel' }))).toEqual({ ok: false, error: 'unknown_tool' })
    expect(admitToolCall(call({ toolName: 'search_hotels', claims: claims({ scopes: ['places:read'] }) }))).toEqual({ ok: false, error: 'insufficient_scope' })
    expect(admitToolCall(call({ toolName: 'create_itinerary', claims: claims({ scopes: ['places:read'] }) }))).toEqual({ ok: false, error: 'insufficient_scope' })
  })
  it('a job or resource owned by another principal is refused (cross-principal)', () => {
    expect(admitToolCall(call({ resourceOwner: 'someone-else' }))).toEqual({ ok: false, error: 'principal_mismatch' })
    expect(admitToolCall(call({ resourceOwner: 'p1' })).ok).toBe(true)
  })
  it('fails closed when the spend pool cannot be reached', () => {
    expect(admitToolCall(call({ spendPoolOk: false }))).toEqual({ ok: false, error: 'spend_pool_unavailable' })
  })
  it('the host, the install and the user are distinct identities: the install id is not the principal', () => {
    const k = claims({ installId: 'inst-9', principalId: 'p1' })
    expect(admitToolCall(call({ claims: k, resourceOwner: 'inst-9' }))).toEqual({ ok: false, error: 'principal_mismatch' })
  })
})

describe('connectorLocation', () => {
  it('explicit beats last-known beats home market; a last-known location needs permission', () => {
    expect(connectorLocation({ explicit: { lat: 21, lng: 105 }, lastKnown: { lat: 10, lng: 106 }, lastKnownPermitted: true, homeMarket: 'VN' })).toMatchObject({ kind: 'explicit', lat: 21 })
    expect(connectorLocation({ lastKnown: { lat: 10, lng: 106 }, lastKnownPermitted: true })).toMatchObject({ kind: 'last_known' })
    expect(connectorLocation({ lastKnown: { lat: 10, lng: 106 }, homeMarket: 'VN' })).toEqual({ kind: 'home_market', market: 'VN', preciseProximityAllowed: false })
  })
  it('a home market is never a precise location; nothing known is none; bad coordinates are ignored', () => {
    expect(connectorLocation({ homeMarket: 'VN' }).preciseProximityAllowed).toBe(false)
    expect(connectorLocation({})).toEqual({ kind: 'none', preciseProximityAllowed: false })
    expect(connectorLocation({ explicit: { lat: 999, lng: 105 } })).toEqual({ kind: 'none', preciseProximityAllowed: false })
    expect(connectorLocation({ explicit: { lat: '21', lng: 105 } })).toEqual({ kind: 'none', preciseProximityAllowed: false })
  })
  it('has no input for a host IP: the contract cannot be handed one', () => {
    expect(connectorLocation.length).toBe(1)
    expect(JSON.stringify(connectorLocation({ homeMarket: 'VN' }))).not.toMatch(/ip/i)
  })
})

describe('shapeResult', () => {
  it('keeps only allowlisted fields: internal scoring and raw TVI never leave', () => {
    const r = shapeResult('search_places', [{ id: '1', name: 'Quán A', rating: 4.5, score: 0.93, rankFormula: 'x', tviFacts: { a: 1 }, secretNote: 's' }])
    expect(r.rows).toEqual([{ id: '1', name: 'Quán A', rating: 4.5 }]); expect(r.partial).toBe(false)
  })
  it('caps the rows at Top-K and says so: no unrestricted pagination', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `n${i}` }))
    const r = shapeResult('search_places', rows)
    expect(r.rows).toHaveLength(CONNECTOR_TOOLS.search_places.maxResults); expect(r.partial).toBe(true); expect(r.dropped).toBe(15)
  })
  it('stops at the byte ceiling and labels the result partial', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: 'x'.repeat(5000) }))
    const r = shapeResult('search_places', rows)
    expect(r.rows.length).toBeLessThan(10); expect(r.partial).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(r.rows)).length).toBeLessThanOrEqual(CONNECTOR_TOOLS.search_places.maxResponseBytes)
  })
  it('a job result carries only the job fields', () => {
    expect(shapeResult('create_itinerary', [{ jobId: 'j1', status: 'queued', pollAfterSeconds: 5, expiresAt: 'x', userEmail: 'a@b.c' }]).rows).toEqual([{ jobId: 'j1', status: 'queued', pollAfterSeconds: 5, expiresAt: 'x' }])
  })
})

describe('spendPoolKeys', () => {
  const k = claims()
  it('every key is in the mcp: namespace the Web/App allocation never uses, and each level is its own counter', () => {
    const keys = spendPoolKeys(k, 'search_places', '2026-11-10')
    expect(keys).toHaveLength(5)
    for (const key of keys) expect(key.startsWith('mcp:')).toBe(true)
    expect(new Set(keys).size).toBe(5)
  })
  it('different principals and installs never share a counter; hostile ids cannot escape the key', () => {
    const a = spendPoolKeys(claims({ principalId: 'a' }), 'search_places', 'd'); const b = spendPoolKeys(claims({ principalId: 'b' }), 'search_places', 'd')
    expect(a[3]).not.toBe(b[3])
    const evil = spendPoolKeys(claims({ installId: 'x:ai:dr:u:1\n' }), 'search_places', 'd')
    expect(evil[2]).not.toContain(':ai:'); expect(evil[2]).not.toContain('\n')
  })
})

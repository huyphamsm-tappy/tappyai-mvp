import { describe, it, expect, vi } from 'vitest'
import { buildVerifier, buildGatewayDeps, denyAllVerifier } from './defaultDeps'

const AUD = 'https://mcp.test/api/mcp'
const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = `${b64({ alg: 'ES256' })}.${b64({ sub: SUB, aud: AUD, exp: Date.now() / 1000 + 600, client_id: 'c1', scope: 'places:read' })}.sig`
const CONFIG = { MCP_RESOURCE_URL: AUD, MCP_OAUTH_CLIENTS: JSON.stringify({ c1: { host: 'claude' } }) }

describe('default wiring is inert until fully configured', () => {
  it('no configuration: deny-all', async () => {
    expect(buildVerifier({})).toBe(denyAllVerifier)
    expect(await buildGatewayDeps({}).verify(`Bearer ${token}`)).toBeNull()
  })
  it('each missing piece keeps it deny-all: https resource, a registered client, the identity provider', () => {
    const getUser = async () => ({ id: SUB })
    expect(buildVerifier({ ...CONFIG, MCP_RESOURCE_URL: 'http://x.example' }, getUser)).toBe(denyAllVerifier)
    expect(buildVerifier({ ...CONFIG, MCP_OAUTH_CLIENTS: '{}' }, getUser)).toBe(denyAllVerifier)
    expect(buildVerifier({ ...CONFIG, MCP_OAUTH_CLIENTS: 'not json' }, getUser)).toBe(denyAllVerifier)
    expect(buildVerifier({ ...CONFIG })).toBe(denyAllVerifier) // no provider settings and no seam
  })
  it('fully configured: tokens are verified through the identity provider', async () => {
    const getUser = vi.fn(async () => ({ id: SUB }))
    const v = buildVerifier(CONFIG, getUser)
    expect(v).not.toBe(denyAllVerifier)
    expect((await v(`Bearer ${token}`))?.principalId).toBe(`u:${SUB}`)
    expect(getUser).toHaveBeenCalledTimes(1)
  })
  it('the real adapters stay lazy and the hotel path stays unwired', () => {
    const d = buildGatewayDeps({})
    expect(d.adapters['hotels.prices']).toBeNull()
    expect(typeof d.adapters['places.search']).toBe('function')
  })
})

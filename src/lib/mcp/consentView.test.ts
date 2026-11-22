import { describe, it, expect } from 'vitest'
import { isAuthorizationId, safeOAuthRedirect, scopeLines } from './consentView'
import { MCP_SCOPES } from './identity'

describe('consent screen: pure rules', () => {
  it('only a plain opaque id is accepted as authorization_id', () => {
    expect(isAuthorizationId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
    for (const bad of [undefined, null, '', 'short', 'a/b/c/d/e/f/g/h', 'has space inside it', '<script>alert(1)</script>', 'x'.repeat(200), 123]) expect(isAuthorizationId(bad), String(bad)).toBe(false)
  })
  it('every scope a connector can hold has a plain-words line in both languages, and an unknown scope is shown, not hidden', () => {
    for (const s of MCP_SCOPES) for (const l of ['vi', 'en'] as const) expect(scopeLines(s, l)[0], `${s}/${l}`).not.toMatch(/Unknown|không xác định/)
    expect(scopeLines('places:read mystery:write', 'en')).toEqual(['Search restaurants, places and attractions', 'Unknown permission: mystery:write'])
    expect(scopeLines('', 'vi')).toEqual([])
    expect(scopeLines(undefined, 'vi')).toEqual([])
    expect(scopeLines('itinerary:create', 'vi')[0]).toMatch(/không đặt chỗ, không thanh toán/)
  })
  it('the redirect after the decision: https, localhost http and the Cursor app scheme only; never credentials, scripts or other schemes', () => {
    expect(safeOAuthRedirect('https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz')).toContain('code=abc')
    expect(safeOAuthRedirect('http://localhost:33418/callback?code=1')).toContain('localhost:33418')
    expect(safeOAuthRedirect('http://127.0.0.1:8080/cb')).not.toBeNull()
    expect(safeOAuthRedirect('cursor://anysphere.cursor-mcp/oauth/callback?code=1')).not.toBeNull()
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://evil.example/cb', 'ftp://x.example/', 'https://user:pass@x.example/cb', 'vscode://x/y', 'not a url', '', null, undefined, 5, 'https://x.example/' + 'a'.repeat(4100)]) expect(safeOAuthRedirect(bad), String(bad)).toBeNull()
  })
})

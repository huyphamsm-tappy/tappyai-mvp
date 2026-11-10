import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addVideoCdnHost, videoCdnOrigin } from './videoCdnCsp.mjs'

// Explore video: the CDN host is added to the CSP ONLY when VIDEO_CDN_HOST is set and is a bare hostname. Unset => the policy is byte-for-byte what it was.
describe('videoCdnOrigin', () => {
  it('is empty when unset, empty, or anything but a bare hostname (no scheme, path, port, wildcard, space, semicolon)', () => {
    for (const bad of [undefined, '', '  ', 'https://media.example.com', 'media.example.com/x', 'media.example.com:8080', '*.example.com', 'a b.example.com', "x.example.com; script-src *", 'localhost', 'a..b.com'])
      expect(videoCdnOrigin({ VIDEO_CDN_HOST: bad }), String(bad)).toBe('')
    expect(videoCdnOrigin({})).toBe('')
  })
  it('is https://<host> for a valid hostname, lower-cased', () => {
    expect(videoCdnOrigin({ VIDEO_CDN_HOST: 'Media.Tappyai.com' })).toBe('https://media.tappyai.com')
  })
})

describe('addVideoCdnHost', () => {
  const connect = "connect-src 'self' https://*.supabase.co https://storage.googleapis.com"
  it('🚨 with the variable unset the directive is returned UNCHANGED', () => {
    expect(addVideoCdnHost(connect, {})).toBe(connect)
    expect(addVideoCdnHost(connect, { VIDEO_CDN_HOST: '' })).toBe(connect)
    expect(addVideoCdnHost(connect, { VIDEO_CDN_HOST: 'https://evil.example' })).toBe(connect)
  })
  it('appends the origin once when set (and never twice)', () => {
    const env = { VIDEO_CDN_HOST: 'media.tappyai.com' }
    const out = addVideoCdnHost(connect, env)
    expect(out).toBe(`${connect} https://media.tappyai.com`)
    expect(addVideoCdnHost(out, env)).toBe(out)
  })
})

describe('next.config.mjs wiring', () => {
  const cfg = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')
  it('wraps exactly the connect-src, media-src and img-src directives, and keeps their base text', () => {
    expect(cfg).toMatch(/import \{ addVideoCdnHost \} from '\.\/scripts\/videoCdnCsp\.mjs'/)
    expect(cfg).toMatch(/addVideoCdnHost\("img-src 'self' data: blob: https:", process\.env\)/)
    expect(cfg).toMatch(/addVideoCdnHost\("media-src 'self' data: blob: https:", process\.env\)/)
    expect(cfg).toMatch(/addVideoCdnHost\("connect-src 'self' https:\/\/\*\.supabase\.co[^"]*https:\/\/storage\.googleapis\.com", process\.env\)/)
    expect((cfg.match(/addVideoCdnHost\(/g) ?? []).length).toBe(3)
  })
  it('does NOT touch next/image remotePatterns (the CDN serves private HLS, never an image the optimiser could fetch without the cookie)', () => {
    expect(cfg).not.toMatch(/remotePatterns[\s\S]{0,1200}videoCdn/)
  })
})

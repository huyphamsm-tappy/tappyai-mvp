import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OPTIMIZABLE_IMAGE_HOSTS, isOptimizableImageSrc } from './imageHosts'

// F-057: the list SafeImage trusts must be exactly the list next/image optimises. If they drift,
// either an allowed host renders a placeholder, or an unlisted one reaches next/image and throws.
describe('OPTIMIZABLE_IMAGE_HOSTS mirrors next.config.mjs images.remotePatterns', () => {
  it('has the same hostnames, all https', () => {
    const cfg = readFileSync('next.config.mjs', 'utf8')
    const block = cfg.slice(cfg.indexOf('remotePatterns'), cfg.indexOf(']', cfg.indexOf('remotePatterns')))
    const hosts = [...block.matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1])
    const protocols = [...block.matchAll(/protocol:\s*'([^']+)'/g)].map((m) => m[1])
    expect(hosts.length).toBeGreaterThan(0)
    expect([...hosts].sort()).toEqual([...OPTIMIZABLE_IMAGE_HOSTS].sort())
    expect(new Set(protocols)).toEqual(new Set(['https']))
  })
})

describe('isOptimizableImageSrc', () => {
  it.each([
    ['/branding/otter-logo.png', true],
    ['data:image/png;base64,AAAA', true],
    ['blob:http://localhost:3007/abc', true],
    ['https://storage.googleapis.com/tappyai-media-prod/reviews/u/1.jpg', true],
    ['https://zdaprdfgpbpnxyofagmc.supabase.co/storage/v1/object/sign/x/y.png?token=t', true],
    ['https://lh3.googleusercontent.com/a/abc', true],
    ['https://s120-ava-talk.zadn.vn/a.jpg', true],
    // the F-057 repro host
    ['https://images.unsplash.com/photo-1?w=800', false],
    ['http://storage.googleapis.com/x.jpg', false],
    ['//storage.googleapis.com/x.jpg', false],
    ['https://a.b.supabase.co/x.png', false], // `*.` is exactly one label, as in remotePatterns
    ['https://supabase.co/x.png', false],
    ['https://evilsupabase.co/x.png', false],
    ['not a url', false],
    ['', false],
  ])('%s → %s', (src, ok) => {
    expect(isOptimizableImageSrc(src)).toBe(ok)
  })

  it('null / undefined → false', () => {
    expect(isOptimizableImageSrc(null)).toBe(false)
    expect(isOptimizableImageSrc(undefined)).toBe(false)
  })
})

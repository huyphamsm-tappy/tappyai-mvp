import { describe, it, expect } from 'vitest'
import { CINEMA_NOW_SHOWING_PAGES } from './nowShowing'
import { PROVIDER_REGISTRY, isAllowedHost } from '../registry'

describe('cinema now-showing pages (owner 01/10: CGV + Galaxy + Lotte + BHD + Beta)', () => {
  it('lists the five chains, each on a host of a registry provider (https, no tracking query)', () => {
    expect(CINEMA_NOW_SHOWING_PAGES.map((p) => p.name)).toEqual(['CGV', 'Galaxy Cinema', 'Lotte Cinema', 'BHD Star', 'Beta Cinemas'])
    for (const p of CINEMA_NOW_SHOWING_PAGES) {
      const u = new URL(p.url)
      expect(u.protocol).toBe('https:')
      expect(u.search).toBe('')
      expect(PROVIDER_REGISTRY.some((e) => e.domains.includes('entertainment') && isAllowedHost(e, u.hostname)), p.name).toBe(true)
    }
  })
  it('the four new chains add NO film discovery scope (no extra Serper search per film question)', () => {
    for (const id of ['galaxy', 'lotte', 'bhd', 'beta']) expect(PROVIDER_REGISTRY.find((e) => e.providerId === id)!.discovery).toBeUndefined()
  })
})

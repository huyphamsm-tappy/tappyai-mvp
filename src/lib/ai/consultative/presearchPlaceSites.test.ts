// Wave 4 (B) · presearchPlaceSites: the venue websites of a code pre-search, from the FULL rows, for the venues the model's slimmed copy still names. Pure; no network.
import { describe, it, expect } from 'vitest'
import { presearchPlaceSites } from './presearch'

const full = (rows: Array<Record<string, unknown>>) => ({ results: rows })
const shown = (...names: string[]) => ({ results: names.map(name => ({ name, rating_value: 4.5 })) })

describe('presearchPlaceSites', () => {
  it('a shown venue with a website gives its site (website_uri first, then website)', () => {
    expect(presearchPlaceSites(full([{ name: 'A', website_uri: 'https://a.example/', website: 'https://other.example/' }, { name: 'B', website: 'http://b.example/menu' }]), shown('A', 'B')))
      .toEqual([{ name: 'A', website: 'https://a.example/' }, { name: 'B', website: 'http://b.example/menu' }])
  })
  it('a venue the model never saw gives nothing (the slimmed copy decides who counts)', () => {
    expect(presearchPlaceSites(full([{ name: 'A', website_uri: 'https://a.example/' }, { name: 'Hidden', website_uri: 'https://hidden.example/' }]), shown('A')))
      .toEqual([{ name: 'A', website: 'https://a.example/' }])
  })
  it('no name, no website, a non-web scheme, an unparseable value: nothing', () => {
    const rows = [{ website_uri: 'https://x.example/' }, { name: 'N' }, { name: 'F', website_uri: 'ftp://f.example/' }, { name: 'J', website_uri: 'javascript:alert(1)' }, { name: 'U', website_uri: 'not a url' }, { name: 'K', website_uri: 42 }]
    expect(presearchPlaceSites(full(rows), shown('N', 'F', 'J', 'U', 'K'))).toEqual([])
  })
  it('one entry per venue, at most 10', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ name: `V${i}`, website_uri: `https://v${i}.example/` }))
    const out = presearchPlaceSites(full([...rows, { name: 'V0', website_uri: 'https://dupe.example/' }]), shown(...rows.map(r => r.name)))
    expect(out).toHaveLength(10)
    expect(out.filter(o => o.name === 'V0')).toEqual([{ name: 'V0', website: 'https://v0.example/' }])
  })
  it('anything that is not a result with rows gives nothing', () => {
    for (const [a, b] of [[null, shown('A')], [undefined, shown('A')], ['x', shown('A')], [{ results: 'x' }, shown('A')], [full([{ name: 'A', website_uri: 'https://a.example/' }]), null], [full([{ name: 'A', website_uri: 'https://a.example/' }]), { error: 'x' }]] as Array<[unknown, unknown]>) {
      expect(presearchPlaceSites(a, b)).toEqual([])
    }
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compactSystemLinks, SYSTEM_LINK_ROW_CAP } from './systemLinkRow'

// 29/10: a flight + hotel turn ended in a row of ~13 "partner" buttons. Nobody reads 13; the first few the tool ranked are the useful ones.

const mk = (name: string, url = `https://x.test/${name}`) => ({ name, url })

describe('compactSystemLinks', () => {
  it('keeps at most SYSTEM_LINK_ROW_CAP links, in the order the tool ranked them', () => {
    const links = Array.from({ length: 13 }, (_, i) => mk(`P${i}`))
    const out = compactSystemLinks(links)
    expect(out).toHaveLength(SYSTEM_LINK_ROW_CAP)
    expect(out.map(l => l.name)).toEqual(links.slice(0, SYSTEM_LINK_ROW_CAP).map(l => l.name))
  })
  it('one button per provider: the same provider name twice keeps the first', () => {
    const out = compactSystemLinks([mk('Agoda · Hotel A', 'https://a/1'), mk('Agoda · Hotel A', 'https://a/2'), mk('Booking · Hotel A', 'https://b/1')])
    expect(out.map(l => l.url)).toEqual(['https://a/1', 'https://b/1'])
  })
  it('a short row is returned untouched', () => {
    const links = [mk('A'), mk('B')]
    expect(compactSystemLinks(links)).toEqual(links)
  })
  it('cap is 6', () => { expect(SYSTEM_LINK_ROW_CAP).toBe(6) })
})

describe('wiring', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/ai/streamEnrichment.ts'), 'utf8')
  it('the row is compacted for one brain only, and only where it is rendered', () => {
    expect(src).toContain('collector?.oneBrain === true ? compactSystemLinks(missingSystemLinks) : missingSystemLinks')
  })
})

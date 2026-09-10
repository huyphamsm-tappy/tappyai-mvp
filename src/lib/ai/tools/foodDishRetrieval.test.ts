import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlacesOSM } from './food'
import { osmCategoryFor } from './osmCategory'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE DISH MUST REACH THE PROVIDER, AND THE PROVIDER MUST NOT BE TRUSTED.
//
// Two halves of one rule. Overpass gets `["name"~"bún bò|bun bo",i]` because
// that is the question the user asked — measured live 2026-09-09 at
// (10.7756,106.7019) r=1500, it returns six real bún bò restaurants in 1.2s.
// But Overpass matches that regex over raw UTF-8 BYTES, so every row it hands
// back is re-checked in JS through `normalizeVN`. A row that cannot be shown to
// serve the dish is dropped, and if that empties the list the reply falls back
// to nearby venues carrying `constraint_unmet` — never a venue relabelled.
// ─────────────────────────────────────────────────────────────────────────────

let overpassUrls: string[]

const el = (name: string, extra: Record<string, string> = {}) => ({
  type: 'node', lat: 10.77, lon: 106.7, tags: { name, ...extra },
})

/** `constrained` answers the dish query; `fallback` answers the unconstrained retry. */
function stub(constrained: unknown[], fallback: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('nominatim')) return new Response(JSON.stringify([{ lat: '10.7756', lon: '106.7019' }]), { status: 200 })
    if (url.includes('overpass') || url.includes('maps.mail.ru')) {
      overpassUrls.push(url)
      const isConstrained = decodeURIComponent(url).includes('"name"~"bún bò')
      return new Response(JSON.stringify({ elements: isConstrained ? constrained : fallback }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }))
}

beforeEach(() => { overpassUrls = []; __clearToolCache() })
afterEach(() => { vi.unstubAllGlobals() })

interface Res {
  results?: Array<{ name: string }>
  requested_constraints?: string[]
  constraint_unmet?: boolean
  constraint_note?: string
}
const search = (q: string) => searchPlacesOSM(q, 'Quận 1', 'restaurant', null, 'vi') as Promise<Res>

describe('dish reaches the Overpass query', () => {
  it('sends the dish as a name filter, in literal-alternative form', async () => {
    stub([el('Bún Bò Huế Gia Hội')], [])
    await search('bún bò ở Quận 1')
    const q = decodeURIComponent(overpassUrls[0])
    expect(q).toContain('["name"~"bún bò|bun bo",i]')
    // The byte-wise trap: a character class over Vietnamese vowels matches nothing.
    expect(q).not.toContain('b[u')
  })

  it('widens to fast_food, where counter-service dish venues are tagged', async () => {
    stub([el('Bún Bò Huế Gia Hội')], [])
    await search('bún bò ở Quận 1')
    const q = decodeURIComponent(overpassUrls[0])
    expect(q).toContain('["amenity"="restaurant"]')
    expect(q).toContain('["amenity"="fast_food"]')
  })

  it('leaves a query with no dish on the plain restaurant tag', async () => {
    stub([], [el('Quán Ăn A')])
    await search('quán ăn ngon ở Quận 1')
    const q = decodeURIComponent(overpassUrls[0])
    expect(q).not.toContain('fast_food')
    expect(q).not.toContain('"name"~"bún')
    expect(osmCategoryFor('quán ăn ngon', 'restaurant').selectors).toHaveLength(1)
  })
})

describe('the provider is narrowed, JavaScript decides', () => {
  it('keeps only the rows whose own name states the dish', async () => {
    stub([el('Bún Bò Huế Gia Hội'), el('Crazy Buffalo'), el('Quán Bún Bò Gánh')], [])
    const r = await search('bún bò ở Quận 1')
    expect(r.results?.map(x => x.name)).toEqual(['Bún Bò Huế Gia Hội', 'Quán Bún Bò Gánh'])
    expect(r.constraint_unmet).toBe(false)
  })

  it('reports the dish as unmet rather than relabelling nearby venues', async () => {
    // Every constrained row is a byte-regex false positive; none serve the dish.
    stub([el('Crazy Buffalo')], [el('Jaspas'), el('Au Tresor')])
    const r = await search('bún bò ở Quận 1')
    expect(r.constraint_unmet).toBe(true)
    expect(r.requested_constraints).toContain('bún bò')
    expect(r.constraint_note).toContain('bún bò')
    // The user still gets nearby options — flagged, never presented as the dish.
    expect(r.results?.map(x => x.name)).toEqual(['Jaspas', 'Au Tresor'])
  })

  it('never returns a venue unrelated to the dish as though it matched', async () => {
    stub([], [el('Jaspas')])
    const r = await search('bún bò ở Quận 1')
    expect(r.constraint_unmet).toBe(true)
  })
})

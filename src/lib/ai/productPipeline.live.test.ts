import { describe, expect, it } from 'vitest'
import live from './__fixtures__/serperShopping.live.json'
import { parseProductSpecs, parseVndPrice } from './productSpecs'
import { normalizeToolCandidates } from './candidateEvidence'
import { filterIrrelevantProducts } from './productPreSearch'
import { rankCandidates } from './candidateRanking'
import { isDecisionGrade, buildStateContextBlock, usableCandidates } from './stateContext'
import { createState, newConversationId, ownerScopeFor, type ConversationState } from './conversationState'

/**
 * The whole product pipeline, run over a VERBATIM provider response.
 *
 * Everything here is deterministic — no LLM — so it stays verifiable while the
 * Anthropic key is over its usage limit. The fixture is the real
 * google.serper.dev/shopping payload for "macbook pro m1 32gb 512gb cũ",
 * including the awkward rows: a title ending in "cũ", one wrapped in 【USED】,
 * one reading "32G, 512G", and a "Chính Hãng" listing that states no condition.
 */

/** The same mapping shopping.ts applies to a provider row. */
function toSearchResult(r: Record<string, unknown>) {
  const specs = parseProductSpecs(r.title)
  const priceVnd = parseVndPrice(r.price)
  return {
    title: r.title, link: r.link, price: r.price,
    ...(priceVnd !== null ? { price_vnd: priceVnd } : {}),
    ...(r.source ? { source: r.source } : {}),
    ...(r.rating !== undefined ? { rating: r.rating } : {}),
    ...(r.productId ? { product_id: r.productId } : {}),
    ...specs,
  }
}

const ROWS = (live.shopping as Array<Record<string, unknown>>).map(toSearchResult)
const CANDIDATES = normalizeToolCandidates('search_products', { search_results: ROWS }, 0)

function macState(): ConversationState {
  const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
  s.goal = 'Tôi muốn mua một chiếc Mac cũ để code.'
  s.hardConstraints = [
    { key: 'ram_gb', op: '=', value: 32, statedAs: 'RAM 32GB', turn: 2 },
    { key: 'storage_gb', op: '>=', value: 512, statedAs: 'ổ cứng từ 512GB trở lên', turn: 2 },
    { key: 'condition', op: '=', value: 'used', statedAs: 'Mac cũ', turn: 1 },
  ]
  s.softPreferences = [{ key: 'budget~25000000', weight: 1, statedAs: 'Tầm 25 triệu', turn: 3 }]
  s.useCase = 'coding'
  s.candidates = CANDIDATES
  return s
}

describe('real provider rows -> candidates', () => {
  it('every row becomes exactly one candidate with a distinct identity', () => {
    expect(CANDIDATES).toHaveLength(live.shopping.length)
    expect(new Set(CANDIDATES.map(c => c.candidateId)).size).toBe(CANDIDATES.length)
  })

  it('every candidate carries a price, a seller and its own full title', () => {
    for (const c of CANDIDATES) {
      expect(typeof c.facts.price_vnd).toBe('number')
      expect(c.facts.source_site).toBeTruthy()
      expect(c.name.length).toBeGreaterThan(10)
      expect(isDecisionGrade(c)).toBe(true)
    }
  })

  it('no candidate carries another candidate\'s price', () => {
    const byPrice = new Map<number, string[]>()
    for (const c of CANDIDATES) {
      const p = c.facts.price_vnd as number
      byPrice.set(p, [...(byPrice.get(p) ?? []), c.name])
    }
    // The 29.550.000 row is the one whose price was previously attached to a
    // 16-inch machine. It belongs to exactly one listing, and that is the 14-inch.
    expect(byPrice.get(29_550_000)).toEqual(['MacBook Pro 14 inch M1 Pro 2021 8CPU/32GB/512GB/14GPU cũ'])
  })

  it('reads specs only where the seller wrote them, always with provenance', () => {
    for (const c of CANDIDATES) {
      if (c.facts.ram_gb !== undefined || c.facts.storage_gb !== undefined || c.facts.condition !== undefined) {
        expect(c.facts.spec_source, `${c.name} has values without a source`).toBeTruthy()
        expect(String(c.facts.spec_source)).toBe(c.name)
      }
    }
  })

  it('the "Chính Hãng" listing states no condition — genuine is not new', () => {
    const c = CANDIDATES.find(x => x.name.includes('Chính Hãng'))!
    expect(c.facts.condition).toBeUndefined()
  })

  it('invents no condition percentage; keeps the ones sellers published', () => {
    const labels = CANDIDATES.map(c => String(c.facts.condition_label ?? ''))
    // "Hàng 95%" and "99%" are the seller's own words and may be quoted.
    expect(labels.some(l => /9\d\s*%/.test(l))).toBe(true)
    // …and no candidate acquired a percentage that is not in its own title.
    for (const c of CANDIDATES) {
      const pct = String(c.facts.condition_label ?? '').match(/9\d\s*%/)?.[0]
      if (pct) expect(c.name.replace(/\s+/g, ' ')).toContain(pct.replace(/\s+/g, ' ').replace(' %', '%'))
    }
  })
})

describe('hard constraints against real listings', () => {
  const s = macState()
  const ranked = rankCandidates(s.candidates, s)

  it('never records a spec-less listing as SATISFIED — it is unverified', () => {
    // The design keeps UNKNOWN in the running (only VIOLATED is filtered) and
    // reports it as unverified, so the assertion is about the verdict, not
    // about exclusion.
    const specless = CANDIDATES.filter(c => c.facts.ram_gb === undefined)
    expect(specless.length).toBeGreaterThan(0)

    for (const r of ranked.ranked) {
      const ram = r.checks.find(c => c.key === 'ram_gb')
      if (r.candidate.facts.ram_gb === undefined) expect(ram?.verdict).toBe('unknown')
      else expect(ram?.verdict).toBe('satisfied')
    }
  })

  it('ranks a verified 32GB/512GB listing above an unverified one', () => {
    const verified = ranked.ranked.filter(r => r.candidate.facts.ram_gb === 32)
    const unverified = ranked.ranked.filter(r => r.candidate.facts.ram_gb === undefined)
    if (verified.length && unverified.length) {
      expect(Math.min(...verified.map(r => r.score))).toBeGreaterThan(Math.max(...unverified.map(r => r.score)))
    }
  })

  it('a 16GB or 256GB listing could never satisfy the 32GB/512GB ask', () => {
    const small = { candidateId: 'small', name: 'MacBook Air M2 16GB/256GB cũ', type: 'product' as const,
      source: 'search_products', retrievedAt: 0, facts: { ram_gb: 16, storage_gb: 256, condition: 'used', price_vnd: 20_000_000 } }
    const out = rankCandidates([...CANDIDATES, small], macState())
    expect(out.ranked.map(r => r.candidate.name)).not.toContain(small.name)
    expect(out.excluded.some(e => e.name === small.name)).toBe(true)
  })

  it('there IS a real match inside the stated budget — the advice is possible', () => {
    const affordable = ranked.ranked.filter(r => Number(r.candidate.facts.price_vnd) <= 30_000_000)
    expect(affordable.length).toBeGreaterThan(0)
  })
})

describe('irrelevant rows and the prompt', () => {
  it('keeps every real MacBook listing — none is mistaken for cosmetics', () => {
    expect(filterIrrelevantProducts(CANDIDATES, macState())).toHaveLength(CANDIDATES.length)
  })

  it('drops a lipstick row that the same query really returned', () => {
    const lipstick = { candidateId: 'son', name: 'Son MAC 835 Modesty Màu Hồng Khô', type: 'product' as const,
      source: 'search_products', retrievedAt: 0, facts: { price_vnd: 550_000 } }
    expect(filterIrrelevantProducts([...CANDIDATES, lipstick], macState()).map(c => c.name)).not.toContain(lipstick.name)
  })

  it('each prompt line pairs a title with its OWN price, and nothing else\'s', () => {
    const block = buildStateContextBlock(macState())
    // The evidence block caps at MAX_CANDIDATES_SHOWN (8); the invariant under
    // test is about the lines that ARE rendered.
    for (const c of usableCandidates(macState()).slice(0, 8)) {
      const line = block.split('\n').find(l => l.includes(c.name))
      expect(line, `${c.name} missing from evidence`).toBeTruthy()
      expect(line).toContain(String(c.facts.price_vnd))
      for (const other of CANDIDATES) {
        if (other.candidateId === c.candidateId) continue
        if (other.facts.price_vnd === c.facts.price_vnd) continue
        expect(line).not.toContain(String(other.facts.price_vnd))
      }
    }
  })
})

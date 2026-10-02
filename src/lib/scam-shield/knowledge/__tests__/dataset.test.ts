import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  KNOWLEDGE_DATASETS, KNOWLEDGE_CATEGORIES, OFFICIAL_SOURCE_HOSTS, allScenarios, scenariosIn, scenarioById,
  datasetOf, isOfficialSourceUrl,
} from '../index'
import { BOCONGAN_2026 } from '../bocongan2026'
import { ATTACK_GOALS } from '../../message/types'

// ── The official knowledge dataset — provenance is enforced, not promised ───
//
// Every record must be traceable to an official authority's own domain, carry the source title and
// organisation, and be marked verified. A record that cannot say where it came from does not ship.

const all = allScenarios()

describe('every record has provenance', () => {
  it.each(all.map(s => [s.id, s] as const))('%s — verified, organisation, title, official URL', (_id, s) => {
    expect(s.verified).toBe(true)
    expect(s.language).toBe('vi')
    expect(s.source.organization.length).toBeGreaterThan(2)
    expect(s.source.title.length).toBeGreaterThan(10)
    expect(isOfficialSourceUrl(s.source.url)).toBe(true)
    if (s.source.mediaUrl) expect(isOfficialSourceUrl(s.source.mediaUrl)).toBe(true)
    expect(s.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    if (s.source.publishedAt) expect(s.source.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('no source is fabricated: every URL host is on the official allowlist, https only', () => {
    for (const s of all) {
      const host = new URL(s.source.url).hostname
      expect(OFFICIAL_SOURCE_HOSTS.some(h => host === h || host.endsWith(`.${h}`)), `${s.id}: ${host}`).toBe(true)
    }
    expect(isOfficialSourceUrl('https://example.com/scam-list')).toBe(false)
    expect(isOfficialSourceUrl('https://vnexpress.net/lua-dao')).toBe(false)
    expect(isOfficialSourceUrl('http://bocongan.gov.vn/x')).toBe(false)
    expect(isOfficialSourceUrl('https://bocongan.gov.vn.evil.com/x')).toBe(false)
    expect(isOfficialSourceUrl('not a url')).toBe(false)
  })

  it('the allowlist names only government / national-agency domains', () => {
    for (const h of OFFICIAL_SOURCE_HOSTS) expect(h).toMatch(/\.(gov\.vn|vn)$/)
    expect(OFFICIAL_SOURCE_HOSTS).not.toContain('facebook.com')
  })
})

describe('the Bộ Công an 2026 dataset', () => {
  it('holds exactly the 25 officially numbered scenarios, 1..25, no gaps, no duplicates', () => {
    const numbers = BOCONGAN_2026.scenarios.map(s => s.officialNumber).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(new Set(BOCONGAN_2026.scenarios.map(s => s.id)).size).toBe(25)
    expect(new Set(BOCONGAN_2026.scenarios.map(s => s.official.title)).size).toBe(25)
  })

  it('every scenario sits in one of the five official groups, and every group is used', () => {
    const groupCats = new Set(BOCONGAN_2026.groups.map(g => g.category))
    expect([...groupCats].sort()).toEqual([...KNOWLEDGE_CATEGORIES].sort())
    for (const s of BOCONGAN_2026.scenarios) expect(groupCats.has(s.category)).toBe(true)
    for (const c of KNOWLEDGE_CATEGORIES) expect(scenariosIn(c).length).toBeGreaterThan(0)
    // The official distribution read off the infographic: 10 / 3 / 6 / 4 / 2.
    expect(scenariosIn('impersonation')).toHaveLength(10)
    expect(scenariosIn('ai_deepfake')).toHaveLength(3)
    expect(scenariosIn('investment_jobs')).toHaveLength(6)
    expect(scenariosIn('online_trading')).toHaveLength(4)
    expect(scenariosIn('data_theft')).toHaveLength(2)
  })

  it('every record carries the same official source, published 2026-09-08 on bocongan.gov.vn', () => {
    for (const s of BOCONGAN_2026.scenarios) {
      expect(s.source).toBe(BOCONGAN_2026.source)
      expect(s.source.organization).toBe('Bộ Công an')
      expect(s.source.url).toMatch(/^https:\/\/bocongan\.gov\.vn\//)
      expect(s.source.publishedAt).toBe('2026-09-08')
    }
  })

  it('official text and TappyAI guidance are separate, and both are filled', () => {
    for (const s of BOCONGAN_2026.scenarios) {
      expect(s.official.title.length).toBeGreaterThan(5)
      expect(s.official.summary.length).toBeGreaterThan(20)
      expect(s.guidance.warningSigns.length).toBeGreaterThan(0)
      expect(s.guidance.commonRequests.length).toBeGreaterThan(0)
      expect(s.guidance.whatToDo.length).toBeGreaterThan(0)
      expect(s.guidance.whatNotToDo.length).toBeGreaterThan(0)
      // Guidance must not masquerade as a quotation of the source.
      for (const line of [...s.guidance.warningSigns, ...s.guidance.whatToDo, ...s.guidance.whatNotToDo]) {
        expect(line).not.toBe(s.official.summary)
      }
    }
  })

  it('maps every scenario onto the message-analysis attack-goal taxonomy', () => {
    for (const s of BOCONGAN_2026.scenarios) expect(ATTACK_GOALS).toContain(s.attackerGoal)
  })

  it('carries the official prevention measures, attacker goals and the 113 hotline verbatim', () => {
    expect(BOCONGAN_2026.official.preventionMeasures).toHaveLength(5)
    expect(BOCONGAN_2026.official.attackerGoals).toHaveLength(4)
    expect(BOCONGAN_2026.official.hotline).toBe('113')
    expect(BOCONGAN_2026.official.reportAdvice).toContain('113')
    expect(BOCONGAN_2026.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  })
})

describe('the query surface', () => {
  it('lists all datasets and returns scenarios in official order', () => {
    expect(KNOWLEDGE_DATASETS).toContain(BOCONGAN_2026)
    expect(all.map(s => s.officialNumber)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(scenariosIn('all')).toHaveLength(25)
  })
  it('finds by id and resolves the dataset', () => {
    const s = scenarioById('bca-2026-03')!
    expect(s.official.title).toBe('Mạo danh cơ quan tố tụng')
    expect(datasetOf(s)).toBe(BOCONGAN_2026)
    expect(scenarioById('nope')).toBeNull()
  })
})

describe('🚨 browsing knowledge costs nothing', () => {
  it('the module never imports a model, a limiter, a quota, or the network', () => {
    const files = ['src/lib/scam-shield/knowledge/index.ts', 'src/lib/scam-shield/knowledge/bocongan2026.ts', 'src/lib/scam-shield/knowledge/types.ts']
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(src, f).not.toMatch(/@\/lib\/ai\/llm|AI\.(generate|vision|stream)|fetch\(|publicRateLimit|consumeAiAnalysis|quota\b/)
      expect(src, f).not.toMatch(/\basync\b|\bawait\b/)
    }
  })
})

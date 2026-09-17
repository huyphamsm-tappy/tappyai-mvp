import type { KnowledgeCategory, KnowledgeDataset, ScamScenario } from './types'
import { BOCONGAN_2026 } from './bocongan2026'

// Scam Shield · official anti-fraud knowledge — the public surface.
//
// Static and synchronous on purpose: browsing a scenario costs nothing — no request, no model, no
// quota. Adding a dataset means adding a file next to `bocongan2026.ts` and listing it here; the
// dataset test then holds it to the same provenance rules.

/**
 * Hosts an official record may cite. A record whose source is not on one of these domains fails
 * the dataset test — that is the "no fabricated source" guarantee, enforced rather than promised.
 * Extend deliberately, with the authority's own domain only; never a newspaper, aggregator or blog.
 */
export const OFFICIAL_SOURCE_HOSTS = [
  'bocongan.gov.vn',   // Cổng thông tin điện tử Bộ Công an
  'mps.gov.vn',        // Bộ Công an (English / mirror)
  'ncsc.gov.vn',       // Trung tâm Giám sát an toàn không gian mạng quốc gia
  'khonggianmang.vn',  // Cục An toàn thông tin — Chiến dịch nhận diện lừa đảo
  'tinnhiemmang.vn',   // NCSC — Tín nhiệm mạng
  'chinhphu.vn',       // Cổng thông tin điện tử Chính phủ
] as const

export const KNOWLEDGE_DATASETS: readonly KnowledgeDataset[] = [BOCONGAN_2026]

/** Every scenario across datasets, in official-number order within each dataset. */
export function allScenarios(): ScamScenario[] {
  return KNOWLEDGE_DATASETS.flatMap(d => [...d.scenarios].sort((a, b) => a.officialNumber - b.officialNumber))
}

export function scenariosIn(category: KnowledgeCategory | 'all'): ScamScenario[] {
  const all = allScenarios()
  return category === 'all' ? all : all.filter(s => s.category === category)
}

export function scenarioById(id: string): ScamScenario | null {
  return allScenarios().find(s => s.id === id) ?? null
}

/** The dataset a scenario belongs to — for the group description and the shared official advice. */
export function datasetOf(scenario: ScamScenario): KnowledgeDataset {
  return KNOWLEDGE_DATASETS.find(d => d.scenarios.includes(scenario)) ?? KNOWLEDGE_DATASETS[0]
}

export function isOfficialSourceUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return OFFICIAL_SOURCE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export type { KnowledgeCategory, KnowledgeDataset, KnowledgeSource, OfficialGroup, ScamScenario } from './types'
export { KNOWLEDGE_CATEGORIES } from './types'

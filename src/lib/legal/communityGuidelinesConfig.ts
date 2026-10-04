// ── Published Community Guidelines: the three legal facts come ONLY from verified configuration ────────────────────────────────
//
// Phase 7 closeout CP6. The canonical document has three placeholders — the effective date, the operating entity and its legal
// address. None of them exists in Tappy's configuration today, and they must never be invented. The published page is therefore
// switched on only when ALL THREE are configured (server env, set by the owner); until then /community-guidelines keeps the current
// page, and a placeholder can never reach a reader.

import { PUBLISHED_GUIDELINES_META, PUBLISHED_GUIDELINES_SECTIONS, type GuidelineSection } from './communityGuidelinesPublished'

export interface GuidelinesLegalFacts { effectiveDate: string; operator: string; address: string }

const PLACEHOLDER = /\[[^\]]{3,60}\]/

/** All three facts, verified non-empty and placeholder-free — or null (publishing stays off). */
export function communityGuidelinesConfig(env: Record<string, string | undefined> = process.env): GuidelinesLegalFacts | null {
  const v = (k: string) => { const s = env[k]?.trim(); return s && !PLACEHOLDER.test(s) ? s : null }
  const effectiveDate = v('COMMUNITY_GUIDELINES_EFFECTIVE_DATE')
  const operator = v('LEGAL_OPERATOR_NAME')
  const address = v('LEGAL_ADDRESS')
  return effectiveDate && operator && address ? { effectiveDate, operator, address } : null
}

function fill(text: string, f: GuidelinesLegalFacts): string {
  return text.replaceAll('[NGÀY HIỆU LỰC]', f.effectiveDate).replaceAll('[TÊN ĐƠN VỊ VẬN HÀNH]', f.operator).replaceAll('[ĐỊA CHỈ PHÁP LÝ]', f.address)
}

/** The published document with the facts substituted. Throws if any placeholder would survive (never ship one). */
export function publishedGuidelines(f: GuidelinesLegalFacts): { meta: string[]; sections: GuidelineSection[] } {
  const meta = PUBLISHED_GUIDELINES_META.map(m => fill(m, f))
  const sections = PUBLISHED_GUIDELINES_SECTIONS.map(s => ({ heading: fill(s.heading, f), blocks: s.blocks.map(b => ({ kind: b.kind, runs: b.runs.map(r => ({ ...r, text: fill(r.text, f) })) })) }))
  // Checked on the TEXT a reader sees (a JSON string would match its own array brackets).
  const texts = [...meta, ...sections.flatMap(s => [s.heading, ...s.blocks.flatMap(b => b.runs.map(r => r.text))])]
  if (texts.some(t => PLACEHOLDER.test(t))) throw new Error('community guidelines: a placeholder survived substitution')
  return { meta, sections }
}

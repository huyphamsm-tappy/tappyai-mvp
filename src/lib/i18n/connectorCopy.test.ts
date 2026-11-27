import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { en, vi } from './legal'
import { CONNECTOR_DOC } from '@/app/connector/connectorDoc'
import type { LegalBlock } from '@/components/legal/legalDoc'

// The public connector pages (27/11/2026): the setup guide at /connector and the privacy policy's section on AI assistant connectors.
// Every claim here is a claim about code that exists: nothing is promised that a tool does not do.

const pick = (d: Record<string, string>, p: string) => Object.entries(d).filter(([k]) => k.startsWith(p))
const keysOf = (b: LegalBlock): string[] => {
  switch (b.kind) {
    case 'lead': case 'p': case 'note': return [b.key]
    case 'bullets': case 'steps': return b.keys
    case 'link': return [b.key, b.labelKey]
    case 'links': return b.items.map(i => i.labelKey)
    case 'faq': return b.items.flatMap(i => [i.q, i.a])
    case 'email': return [b.labelKey]
    default: return []
  }
}

describe('both languages carry the same keys', () => {
  it('the connector guide and the privacy section', () => {
    for (const p of ['legal.connector.', 'legal.privacy.s9.']) {
      expect(pick(en, p).map(([k]) => k).sort(), p).toEqual(pick(vi, p).map(([k]) => k).sort())
      expect(pick(en, p).length, p).toBeGreaterThan(3)
    }
  })
  it('every key the guide uses exists in both languages', () => {
    const keys = [CONNECTOR_DOC.titleKey, CONNECTOR_DOC.effectiveKey, ...CONNECTOR_DOC.sections.flatMap(s => [s.headingKey, ...s.blocks.flatMap(keysOf)])]
    for (const k of keys) { expect(en[k], `en ${k}`).toBeTruthy(); expect(vi[k], `vi ${k}`).toBeTruthy() }
  })
})

describe('/connector, the setup guide', () => {
  const all = (d: Record<string, string>) => pick(d, 'legal.connector.').map(([, v]) => v).join('\n')
  it('gives the real server address and says sign-in is OAuth with no key', () => {
    for (const d of [en, vi]) expect(all(d)).toContain('https://www.tappyai.com/api/mcp')
    expect(all(en)).toMatch(/OAuth/)
    expect(all(en)).toMatch(/no API key/i)
  })
  it('lists the nine read-only tools and says what each does not have', () => {
    const tools = pick(en, 'legal.connector.s4.b').map(([, v]) => v)
    expect(tools).toHaveLength(9)
    const text = tools.join('\n')
    expect(text).toMatch(/coach/i); expect(text).toMatch(/no timetable, price or seat/i)
    expect(text).toMatch(/does not mean the link is safe/i)
    expect(text).toMatch(/author is not shown/i)
    expect(text).not.toMatch(/create_itinerary|itinerary/i) // the long-running itinerary tools are not part of the launch catalog
  })
  it('says it is read-only (never books, pays or buys) and names the approved assistants honestly', () => {
    expect(all(en)).toMatch(/never books, pays or buys/i)
    expect(all(en)).toMatch(/Claude, ChatGPT and Cursor/)
    expect(all(en)).not.toMatch(/Gemini|DeepSeek|Meta AI|Grok/) // not confirmed: not claimed
  })
  it('makes no claim of being live, the best or a guarantee, and no statute', () => {
    for (const d of [en, vi]) expect(all(d)).not.toMatch(/real-?time|thời gian thực|\bbest\b|tốt nhất|guarantee|đảm bảo|GDPR|PDPA|Nghị định|Decree/i)
  })
  it('is a public page: in the sitemap, with its own metadata', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf8')).toMatch(/'\/connector'/)
    expect(readFileSync(join(process.cwd(), 'src/app/connector/page.tsx'), 'utf8')).toMatch(/canonical: PAGE_URL/)
  })
})

describe('the privacy policy: AI assistant connectors', () => {
  const sec = (d: Record<string, string>) => pick(d, 'legal.privacy.s9.').map(([, v]) => v).join('\n')
  it('is numbered in order: 7 connectors, 8 changes, 9 contact', () => {
    expect(en['legal.privacy.s9.heading']).toMatch(/^7\. /)
    expect(en['legal.privacy.s6.heading']).toMatch(/^8\. /)
    expect(en['legal.privacy.s7.heading']).toMatch(/^9\. /)
    expect(vi['legal.privacy.s9.heading']).toMatch(/^7\. /)
    expect(vi['legal.privacy.s6.heading']).toMatch(/^8\. /)
    expect(vi['legal.privacy.s7.heading']).toMatch(/^9\. /)
  })
  it('says what is received (the request, not the whole conversation), what is not returned, what is logged, and how partner links are tracked', () => {
    const t = sec(en)
    expect(t).toMatch(/not your whole conversation/i)
    expect(t).toMatch(/chat history|memories|messages/i)
    expect(t).toMatch(/do not include the text of your request/i)
    expect(t).toMatch(/commission/i)
    expect(t).toMatch(/read-only/i)
    expect(t).toMatch(/author/i)
  })
  it('keeps the policy\'s existing rules: no paid-plan wording, no statute', () => {
    for (const d of [en, vi]) {
      expect(sec(d)).not.toMatch(/stripe|paid plan|gói trả phí|GDPR|PDPA|Nghị định|Decree/i)
    }
  })
  it('the privacy page renders the section between "Reports" and "Changes"', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8')
    const at = (s: string) => src.indexOf(s)
    expect(at("'legal.privacy.s8.heading'")).toBeGreaterThan(-1)
    expect(at("'legal.privacy.s9.heading'")).toBeGreaterThan(at("'legal.privacy.s8.heading'"))
    expect(at("'legal.privacy.s6.heading'")).toBeGreaterThan(at("'legal.privacy.s9.heading'"))
  })
})

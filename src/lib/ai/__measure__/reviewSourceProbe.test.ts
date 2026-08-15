import { describe, it, expect, beforeAll } from 'vitest'
import { AI, type ModelRole } from '@/lib/ai/llm'
import { buildSystem } from '@/lib/ai/promptBuilder'
import { classifyIntent, detectLang, detectExplicitLangRequest, detectLocationIntent, detectPlanningIntent, detectDecisionStage, isSimpleQuery } from '@/lib/ai/intent'
import { extractBudget } from '@/lib/ai/budget'
import { tool } from 'ai'
import { z } from 'zod'

// ── Review-source probe ──────────────────────────────────────────────────────
//
//   TAPPY_MEASURE=1 MEASURE_OUT=<file> npx vitest run src/lib/ai/__measure__/reviewSourceProbe.test.ts
//
// Costs real tokens, so it is skipped unless TAPPY_MEASURE=1 — same convention as
// refinementProbe/cacheProbe.
//
// The question: TikTok is an UNSUPPORTED review source in V1 (product.ts LINK_VIDEO_PROVIDERS,
// promptBuilder rule 18, and streamEnrichment strips any TikTok line unconditionally). So when a
// user asks for one BY NAME, what does the model say? Two outcomes are acceptable — decline
// honestly, or answer with a supported source (Google Maps / official website / Facebook /
// YouTube). One is a real defect: PROMISING a TikTok link and delivering none.
//
// search_places is stubbed with the MODEL-FACING result shape measured on production
// (2026-08-15: keys address, google_rating, maps_link, name, place_id, website_uri — photos and
// order links are carved out by splitToolResult before the model sees them). The URLs below are
// placeholders for prompt-shaping only; nothing here is evidence that any real place carries them.

const MEASURE = process.env.TAPPY_MEASURE === '1'

const PLACES = {
  source: 'Google Maps',
  count: 2,
  results: [
    { place_id: 'PROBE_1', name: 'Tonkin Coffee', address: '12 Nguyễn Huệ, Quận 1',
      google_rating: '4.6⭐ (820 đánh giá Google Maps)',
      maps_link: 'https://maps.google.com/?cid=1111111111', website_uri: 'https://example.test/tonkin' },
    { place_id: 'PROBE_2', name: 'Cà Phê Sáng', address: '48 Lê Lợi, Quận 1',
      google_rating: '4.4⭐ (350 đánh giá Google Maps)',
      maps_link: 'https://maps.google.com/?cid=2222222222' },
  ],
}

/** Mirror the route's own prompt/role derivation so the probe measures the real configuration. */
async function ask(q: string) {
  const lang = detectExplicitLangRequest(q) ?? detectLang(q)
  const intent = classifyIntent(q)
  const planningIntent = detectPlanningIntent(q)
  const built = buildSystem(
    extractBudget(q), detectLocationIntent(q), true, '', lang, '', null,
    planningIntent, false, detectDecisionStage(q, { hasPriorAssistantTurn: false }),
  )
  const role: ModelRole = planningIntent ? 'planning' : isSimpleQuery(q, true) ? 'fast' : 'smart'
  const res = AI.stream({
    role, systemShared: built.shared, system: built.dynamic,
    messages: [{ role: 'user', content: q }],
    maxTokens: 3072, maxSteps: 5,
    tools: {
      search_places: tool({
        description: 'Tìm địa điểm',
        parameters: z.object({ query: z.string(), location: z.string().optional(), type: z.string().optional() }),
        execute: async () => PLACES,
      }),
    },
  })
  // Drain the stream explicitly. Awaiting `.text` alone can stall when nothing pulls.
  let text = ''
  for await (const chunk of res.textStream) text += chunk
  return { text, lang, intent, role }
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const linkHosts = (s: string) => {
  const out: string[] = []
  const re = /\]\((https?:\/\/[^\s)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(host(m[1]))
  return out
}

const CASES = [
  { id: 'vi-tiktok-or-review', q: 'Tìm cho mình một quán cà phê ngon ở Quận 1, có TikTok hoặc link review cho mình xem', expectLang: 'vi' },
  { id: 'vi-review-only', q: 'Tìm một quán ăn ngon ở Quận 1, cho mình link review', expectLang: 'vi' },
  { id: 'en-control', q: 'Find me a good restaurant in District 1 with a review link', expectLang: 'en' },
]

describe.skipIf(!MEASURE)('review sources when the user asks for TikTok / a review link', () => {
  // Vitest does not read .env.local, and shell-sourcing it mangles quoted values.
  beforeAll(async () => {
    const { readFileSync } = await import('node:fs')
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    // Gate on the capability layer, never on a vendor key name (architecture rule
    // no-vendor-api-keys: only the matching adapter may read its own credential).
    if (!AI.isConfigured()) throw new Error('active AI provider is not configured — probe cannot run')
  })

  it('never emits a TikTok URL and never promises one', async () => {
    const report: unknown[] = []
    for (const c of CASES) {
      const { text, lang, role } = await ask(c.q)
      const hosts = linkHosts(text)
      // "Promise" = the model says it is giving a TikTok link. Detected as the word TikTok in a
      // sentence that also offers/points to something, with no tiktok.com URL anywhere.
      const tiktokSentences = text.split(/(?<=[.!?\n])\s*/).filter(s => /tiktok/i.test(s))
      report.push({
        case: c.id, lang, expectLang: c.expectLang, langOk: lang === c.expectLang, role,
        linkHosts: Array.from(new Set(hosts)),
        tiktokURLEmitted: hosts.some(h => /tiktok\.com$/.test(h)),
        tiktokMentioned: /tiktok/i.test(text),
        tiktokSentences,
        supportedReviewSourcePresent: hosts.some(h =>
          /(^|\.)google\.com$/.test(h) || /(^|\.)facebook\.com$/.test(h) || /(^|\.)youtube\.com$/.test(h) || /youtu\.be$/.test(h)),
        mapsLinkPresent: hosts.some(h => /google\.com$/.test(h)),
        hasCTA: /\[CTA_BUTTONS\]/.test(text),
        len: text.length,
      })
    }
    const dest = process.env.MEASURE_OUT
    if (dest) (await import('node:fs')).writeFileSync(dest, JSON.stringify(report, null, 2))
    console.log('REVIEW_SOURCE_REPORT ' + JSON.stringify(report))
    // The one hard invariant: a TikTok URL must never reach the user.
    for (const r of report as Array<{ tiktokURLEmitted: boolean }>) expect(r.tiktokURLEmitted).toBe(false)
  }, 300_000)
})

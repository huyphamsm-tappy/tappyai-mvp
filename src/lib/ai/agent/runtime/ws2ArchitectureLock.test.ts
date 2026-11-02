// @vitest-environment node
// Phase 8 WS2 — architecture locks: research intelligence stays inside the ONE runtime and Luna; code keeps integrity only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { cannedChitchat } from '@/lib/ai/cannedReply'

const read = (p: string) => readFileSync(p, 'utf8')
/** Source without comments (a lock reads the code, not its explanation). */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
const ROUTE = read('src/app/api/chat/route.ts')

describe('WS2 lock · chitchat is a presentation shortcut, nothing more (architecture B)', () => {
  it('on agent turns only the chitchat intent may be canned; every other canned / clarify path is off for the runtime', () => {
    expect(ROUTE).toMatch(/const canned = agentOn \? \(intent === 'chitchat' \? cannedEarly : plannerAsk\)/)
    expect(ROUTE).toMatch(/const plannerNeedsDest = agentOn && !agentV2 &&/)
  })
  it('the canned module has no model, no tool, no search, no task access', () => {
    const src = read('src/lib/ai/cannedReply.ts')
    expect(src).not.toMatch(/from '@\/lib\/ai\/llm'|AI\.(step|stream|extract|generate)|searchPlaces|webSearch|serper|loadTask|saveTask|runtime\/task/i)
  })
  it('only a whole short greeting / thanks / ack / bye is canned; anything with content goes to Luna', () => {
    for (const t of ['chào bạn', 'hi', 'cảm ơn nhé', 'ok', 'bye']) expect(cannedChitchat(t, 'vi'), t).not.toBeNull()
    for (const t of ['chào bạn, tìm quán phở', 'cảm ơn, giờ tìm khách sạn Đà Nẵng', 'ok vậy giá bao nhiêu?', 'hi, AirPods Pro 2 mua ở đâu']) expect(cannedChitchat(t, 'vi'), t).toBeNull()
  })
})

describe('WS2 lock · no second decision system, no score', () => {
  const DEC = code('src/lib/ai/agent/runtime/decisionRecord.ts')
  const PRICE = code('src/lib/ai/agent/runtime/priceEvidence.ts')
  const SRC = code('src/lib/ai/agent/runtime/sourceType.ts')
  it('the decision record has one decision type (RankingContract) and no scoring / sorting of candidates', () => {
    expect(DEC).toMatch(/import \{ matchPick, type RankingContract/)
    expect(DEC).not.toMatch(/\bscore\b|\.sort\(|rating_value|distance_km|weight/i)
  })
  it('price evidence and source classes never pick a winner (no "best", no ordering by class or price)', () => {
    for (const s of [PRICE, SRC]) expect(s).not.toMatch(/\bwinner\b\s*=|bestPrice|cheapest|\.sort\(\(a, b\) => [ab]\.amount/)
    expect(PRICE).not.toMatch(/export function (pick|choose|best)/i)
  })
  it('the decision record is a structured call of the SAME brain (role agent via the AI facade), never another model', () => {
    expect(DEC).toMatch(/AI\.extract\(\{ role: 'agent'/)
    expect(DEC).not.toMatch(/openai|anthropic|gemini|grok|gpt-|claude-/i)
  })
})

describe('WS2 lock · research stays in the runtime: no mandatory search, no new loop, no OpenAI built-in web search', () => {
  it('no new orchestration loop or research engine was added next to the runtime loop', () => {
    for (const f of ['decisionRecord.ts', 'priceEvidence.ts']) expect(read(`src/lib/ai/agent/runtime/${f}`)).not.toMatch(/runAgentRuntime|maxSteps|while \(|for \(;;\)/)
  })
  it('web search stays Tappy Search (Serper) — no provider built-in web search tool', () => {
    for (const f of ['researchSearch.ts', 'readPage.ts', 'index.ts', 'loop.ts']) expect(read(`src/lib/ai/agent/runtime/${f}`)).not.toMatch(/web_search_preview|webSearchPreview|openai\.tools|builtin.*search/i)
  })
  it('trip plans on TAPPY_AGENT=2 are not stripped of tools by a keyword gate (Luna decides research)', () => {
    expect(ROUTE).toMatch(/const planOnlyTurn = agentOn && !agentV2 && planningIntent === 'trip'/)
  })
})

describe('WS2 lock · SSRF protections stay on the page fetch path', () => {
  it('read_page fetches only through the secure page fetch; safeGetText validates every redirect hop (1970e40)', () => {
    expect(read('src/lib/ai/agent/runtime/readPage.ts')).toMatch(/import \{ fetchPublicPage, type PageFetchResult \} from '@\/lib\/security\/safePageFetch'/)
    expect(read('src/lib/ai/agent/runtime/readPage.ts')).not.toMatch(/\bfetch\(/)
    const sf = read('src/lib/security/safeFetch.ts')
    expect(sf).toMatch(/redirect/i)
  })
})

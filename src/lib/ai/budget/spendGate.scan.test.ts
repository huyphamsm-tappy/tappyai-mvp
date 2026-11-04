// @vitest-environment node
// BENCH_SPEND_GATE · static scan: every place in src that can send a PAID request goes through the spend gate, or is in the exception list below
// with the reason. A new paid call point that is in neither makes this test fail. Reads source text only: no network, nothing is run.
//
// How the gate covers each class (see also spendGate.llm.test.ts and spendGate.serper.test.ts):
//   model calls   all of them are built in llm/ai.ts with `model: modelForRole(...)`; modelForRole wraps EVERY concrete model (primary, retry,
//                 fallback) in meteredModel, which reserves the worst-case USD before doGenerate / doStream and settles after.
//   Serper        the one door is serperClient.serperPost; it reserves credits × price before fetch.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scanRoutes } from '@/lib/security/costRoutes/scan'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/[\\/](__tests__|__fixtures__|__measure__)[\\/]/.test(p)) out.push(p)
  }
  return out
}
const FILES = walk(SRC)
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/')
const text = new Map(FILES.map(f => [rel(f), readFileSync(f, 'utf8')]))
/** Comments removed (a `//` after `:` or a quote is kept: URLs inside strings). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const filesMatching = (re: RegExp): string[] => [...text.entries()].filter(([, s]) => re.test(code(s))).map(([f]) => f).sort()

interface Site { id: string; re: RegExp; through: Record<string, string>; exceptions: Record<string, string> }
const SITES: Site[] = [
  {
    id: 'model call (AI SDK)', re: /\b(generateText|streamText|generateObject|streamObject|embed|embedMany)\s*\(/,
    through: { 'src/lib/ai/llm/ai.ts': 'the single entry of every model call; every call is built with model: modelForRole(...) (checked below)' }, exceptions: {},
  },
  {
    id: 'Serper http', re: /google\.serper\.dev/,
    through: { 'src/lib/ai/tools/serperClient.ts': 'the one door to Serper; reserveSpend before fetch (checked below)' }, exceptions: {},
  },
  {
    id: 'OpenAI http', re: /api\.openai\.com/, through: {},
    exceptions: { 'src/lib/ai/llm/providers/openaiModeration.ts': 'EXCEPTION: the Messenger picture safety scan (upload route only, not reachable from POST /api/chat). It calls the moderation endpoint, which is free of charge, so there is no spend to reserve; revisit if that endpoint ever becomes paid.', 'src/lib/ai/llm/providers/openai.ts': 'EXCEPTION: the Responses-API prototype (LLM_OPENAI_API=responses; its model is still wrapped by meteredModel) and the hosted web search (TAPPY_ANSWER_V4, a direct fetch). Both default OFF and are outside the legacy benchmark path; the benchmark runner refuses to run with either set.' },
  },
  {
    id: 'Anthropic http', re: /api\.anthropic\.com/, through: {},
    exceptions: { 'src/lib/ai/llm/providers/anthropicTransport.ts': 'EXCEPTION: only under LLM_PROVIDER=claude, AGENT_MODEL=haiku55 or HAIKU_FALLBACK; its models are wrapped by meteredModel and have no list price, so the gate refuses them (llm/pricing.ts).' },
  },
  {
    id: 'vendor SDK import', re: /from ['"](@ai-sdk\/[a-z-]+|openai|@anthropic-ai\/sdk)['"]/, through: {},
    exceptions: {
      'src/lib/ai/llm/providers/openai.ts': 'the OpenAI adapter: builds the models that registry.ts wraps in meteredModel',
      'src/lib/ai/llm/providers/claude.ts': 'the Claude adapter: builds the models that registry.ts wraps in meteredModel; unpriced, refused by the gate',
    },
  },
  {
    id: 'other paid providers (not on the chat turn path)', re: /texttospeech\.googleapis|webrisk\.googleapis|new Stripe\(/, through: {},
    exceptions: {
      'src/lib/voice/tts/googleTts.ts': 'EXCEPTION: voice route only; not reachable from POST /api/chat (checked with the cost-route scan below)',
      'src/lib/scam-shield/providers/webRisk.ts': 'EXCEPTION: scam-shield routes only; not reachable from POST /api/chat (checked below)',
      'src/app/api/webhooks/stripe/route.ts': 'EXCEPTION: payment webhook route; not part of a chat turn',
      'src/app/api/stripe/portal/route.ts': 'EXCEPTION: payment route; not part of a chat turn',
      'src/app/api/stripe/checkout/route.ts': 'EXCEPTION: payment route; not part of a chat turn',
    },
  },
]

describe('8 · every paid call point goes through the spend gate or is a documented exception', () => {
  for (const s of SITES) {
    it(`${s.id}: no file outside the gate and the exception list`, () => {
      const known = { ...s.through, ...s.exceptions }
      for (const [file, reason] of Object.entries(known)) expect(reason.length, `${file} needs a reason`).toBeGreaterThan(30)
      const found = filesMatching(s.re)
      const unknown = found.filter(f => !(f in known))
      expect(unknown, `new paid call point(s) not behind the spend gate and not in the exception list: ${unknown.join(', ')}`).toEqual([])
      for (const f of Object.keys(known)) expect(found, `${f} is listed but no longer matches: remove it from the list`).toContain(f)
    })
  }

  it('llm/ai.ts: every SDK call takes its model from modelForRole (and from nothing else)', () => {
    const ai = code(text.get('src/lib/ai/llm/ai.ts')!)
    const calls = [...ai.matchAll(/\b(generateText|streamText|generateObject)\s*\(\{/g)].length
    const models = [...ai.matchAll(/\bmodel:\s*([A-Za-z_.]+)\(/g)].map(m => m[1])
    expect(calls).toBeGreaterThanOrEqual(6)
    expect(models).toHaveLength(calls)
    expect(new Set(models)).toEqual(new Set(['modelForRole']))
  })

  it('registry.ts: every concrete model is wrapped in meteredModel before it can be used (primary, retry, fallback, agent model)', () => {
    const reg = code(text.get('src/lib/ai/llm/registry.ts')!)
    const concrete = [...reg.matchAll(/(\.model\(role\)|\.structuredModel\(role\)|createHaiku55AgentModel\()/g)]
    expect(concrete.length).toBeGreaterThanOrEqual(5)
    for (const m of concrete) {
      const lineStart = reg.lastIndexOf('\n', m.index!) + 1
      const before = reg.slice(lineStart, m.index!)
      const inAgentFactory = m[0].startsWith('createHaiku55AgentModel') // wrapped one level up: modelForRole -> meteredModel(agentModel(...))
      expect(inAgentFactory || /meteredModel\(/.test(before), `unwrapped model construction: ${before.trim()}${m[0]}`).toBe(true)
    }
    expect(reg).toMatch(/return meteredModel\(agentModel\(role, opts\), role, kind\)/)
  })

  it('the two doors actually ask the gate: meteredModel (models) and serperPost (Serper) call reserveSpend before they send', () => {
    const metered = code(text.get('src/lib/ai/budget/meteredModel.ts')!)
    const serper = code(text.get('src/lib/ai/tools/serperClient.ts')!)
    expect(metered).toMatch(/reserveSpend\(/)
    expect(serper).toMatch(/reserveSpend\(/)
    expect(serper.indexOf('reserveSpend(')).toBeLessThan(serper.indexOf('fetch(`https://google.serper.dev'))
  })

  it('src does not import from scripts', () => {
    const bad = [...text.entries()].filter(([, s]) => /from ['"](\.\.\/)+scripts\/|from ['"]@\/\.\.\/scripts|from ['"]scripts\//.test(code(s))).map(([f]) => f)
    expect(bad).toEqual([])
  })

  it('what the chat route can reach: only model calls and Serper are cost signals (anything else must be added to the list above with a reason)', () => {
    const chat = scanRoutes(SRC).find(r => r.route === 'chat')
    expect(chat, 'chat route not found by the cost-route scan').toBeTruthy()
    const handled = new Set(['llm', 'serper'])
    // Heuristic (the scan follows imports 3 levels deep): these are reached through modules the benchmark path does not exercise.
    const exceptions: Record<string, string> = {
      'openai-anthropic-http': 'the OpenAI / Anthropic adapters (providers/openai.ts, anthropicTransport.ts) are in the import closure; their direct fetches are the documented exceptions above (Responses prototype, hosted web search, Anthropic models) and the runner refuses to run with their flags ON',
      storage: 'object-storage helpers reachable through the share / result-image modules; no model or search charge, and the 13 benchmark turns are text-only (no upload, no image)',
    }
    const others = chat!.signals.filter(x => !handled.has(x) && !(x in exceptions))
    expect(others, `the chat route reaches cost signal(s) the spend gate does not cover: ${others.join(', ')}`).toEqual([])
    for (const [k, why] of Object.entries(exceptions)) expect(why.length, k).toBeGreaterThan(60)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystem } from '../promptBuilder'
import { buildRankingInstructionBlock } from './pick'

// ── The architecture lock (Phase 3 §7) ──────────────────────────────────────
//
// `recommendationContract.test.ts` — which guards these invariants upstream — is
// UNTRACKED in the primary worktree and therefore absent from this base
// (committed HEAD f49d6c0). The invariants bind regardless of whether their test
// file happens to be committed, so they are asserted here too. These assertions
// are additive and survive the eventual merge.
//
// The deterministic ranker exists precisely so consultative behaviour could be
// added WITHOUT touching any of this.

/** Source with comments stripped, so a comment discussing an option cannot trip a check. */
const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

const ROUTE = 'src/app/api/chat/route.ts'

describe('the chat route still makes exactly one model call', () => {
  it('one AI.stream(), no more', () => {
    expect((code(ROUTE).match(/AI\.stream\(/g) || []).length).toBe(1)
  })

  it('no AI.generate() was introduced for ranking, need extraction or the Pick', () => {
    expect(code(ROUTE)).not.toContain('AI.generate(')
  })
})

describe('no tool forcing, no step rewriting, no prefetch', () => {
  for (const f of [ROUTE, 'src/lib/ai/llm/ai.ts', 'src/lib/ai/llm/types.ts']) {
    it(`${f} sets no toolChoice — 'auto' is the architecture`, () => {
      expect(code(f)).not.toContain('toolChoice')
    })
    it(`${f} uses no prepareStep`, () => {
      expect(code(f)).not.toContain('prepareStep')
    })
  }

  it('forcedTool is still computed but never handed to the model', () => {
    const src = code(ROUTE)
    const call = src.slice(src.indexOf('AI.stream('), src.indexOf('onFinish:'))
    expect(call).not.toContain('forcedTool')
  })

  it('no tool is invoked before generation — ranking runs INSIDE execute()', () => {
    const src = code(ROUTE)
    const beforeStream = src.slice(0, src.indexOf('AI.stream('))
    expect(beforeStream).not.toContain('searchPlaces(')
    expect(beforeStream).not.toContain('searchProducts(')
    expect(beforeStream).not.toContain('getHotelPrices(')
    // The ranker is DEFINED before the stream but must only be CALLED from a
    // tool's execute(), which is the only place candidates exist.
    expect(beforeStream).not.toContain('rankForModel(')
  })
})

describe('prompt building and need extraction never reach for a model', () => {
  for (const f of [
    'src/lib/ai/promptBuilder.ts',
    'src/lib/ai/intent.ts',
    'src/lib/ai/consultative/needProfile.ts',
    'src/lib/ai/consultative/rank.ts',
    'src/lib/ai/consultative/pick.ts',
    'src/lib/ai/consultative/candidate.ts',
    'src/lib/ai/consultative/refinement.ts',
    'src/lib/ai/consultative/replyAnalysis.ts',
  ]) {
    it(`${f} stays model-free`, () => {
      expect(code(f)).not.toContain('@/lib/ai/llm')
    })
  }

  it('the whole consultative module is network-free and clock-free', () => {
    for (const f of ['needProfile', 'rank', 'pick', 'candidate', 'refinement', 'replyAnalysis']) {
      const src = code(`src/lib/ai/consultative/${f}.ts`)
      expect(src, `${f} must not fetch`).not.toContain('fetch(')
      expect(src, `${f} must be deterministic — no clock`).not.toContain('Date.now(')
      expect(src, `${f} must be deterministic — no randomness`).not.toContain('Math.random(')
    }
  })
})

describe('the prompt cache contract survives the Pick work', () => {
  const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

  it('`shared` is byte-identical across every stage, language, context and Pick state', () => {
    const ref = base().shared
    const block = buildRankingInstructionBlock()
    for (const v of [
      buildSystem(null, 'unknown', true, '', 'en', '', null, null, false),
      buildSystem(null, 'offline', false, 'MEM', 'vi', 'PREFS', { lat: 1, lng: 2 }, 'trip', true, 'comparison'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'refinement'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'confirmation'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, block),
      buildSystem(null, 'offline', false, 'MEM', 'en', 'PREFS', { lat: 1, lng: 2 }, 'trip', true, 'comparison', block),
    ]) expect(v.shared).toBe(ref)
  })

  it('the ranking instruction is absent from a turn that cannot produce a ranking', () => {
    expect(base().dynamic).not.toContain('_tappy_ranking')
  })
})

describe('the ranking instruction is only sent on decision-domain turns', () => {
  it('the route gates it on the need profile domain, not unconditionally', () => {
    const src = code(ROUTE)
    expect(src).toContain('isDecisionDomain')
    expect(src).toMatch(/isDecisionDomain\s*\?\s*buildRankingInstructionBlock\(\)/)
  })
})

describe('the transport-mode question is BACKEND-decided, not prompt-decided', () => {
  it('the route computes the trip context deterministically', () => {
    expect(code(ROUTE)).toContain('resolveTripContext(messages)')
  })

  it('the block is gated on shouldAskTransportMode, never sent unconditionally', () => {
    expect(code(ROUTE)).toMatch(/tripContext\.shouldAskTransportMode\s*\?\s*buildTransportModeBlock\(\)/)
  })

  it('the trip module stays model-free, network-free and deterministic', () => {
    const src = code('src/lib/ai/consultative/tripContext.ts')
    expect(src).not.toContain('@/lib/ai/llm')
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('Date.now(')
    expect(src).not.toContain('Math.random(')
  })

  it('the question never reaches the cached `shared` segment', () => {
    const base = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
    expect(base.shared).not.toContain('CHON PHUONG TIEN')
  })
})

describe('the AI SDK is not upgraded out from under the toolChoice assumption', () => {
  it('still ai@4.3.x', () => {
    const version = JSON.parse(readFileSync('node_modules/ai/package.json', 'utf8')).version as string
    expect(version).toMatch(/^4\.3\./)
  })
})

describe('the consultative layer never AUTHORS a link of any kind', () => {
  // ── Contract corrected 2026-08-17, on owner decision ──────────────────────
  //
  // This block used to assert that TikTok review links must always be STRIPPED.
  // That was the V1 contract and it is superseded: the STEP 9 production probe of
  // `main` (d0d221e) returned a live `🎵 [Review TikTok](…)` line and a tool
  // result carrying `has_tiktok_review: true`. The shipped
  // `feat/tiktok-consultative-review-links` capability is now the source of
  // truth, and production must not be downgraded to this branch's older baseline.
  //
  // What remains true, and is what these assertions actually protect: the
  // consultative layer ORDERS and EXPLAINS evidence. It never authors a URL — of
  // any provider. Preservation is proven positively in tiktokPreservation.test.ts.
  it('no consultative module contains a hardcoded URL or provider host', () => {
    for (const f of ['needProfile', 'rank', 'pick', 'candidate', 'refinement', 'replyAnalysis']) {
      const src = code(`src/lib/ai/consultative/${f}.ts`)
      expect(src, `${f} must not author URLs`).not.toMatch(/https?:\/\//)
      expect(src.toLowerCase(), `${f} must not special-case a provider`).not.toContain('tiktok')
    }
  })

  it('the ranking instruction block introduces no link guidance at all', () => {
    expect(buildRankingInstructionBlock().toLowerCase()).not.toContain('tiktok')
    expect(buildRankingInstructionBlock()).not.toContain('http')
  })
})

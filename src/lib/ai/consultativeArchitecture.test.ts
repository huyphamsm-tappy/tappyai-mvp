import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// ── V2-UAT-002, CLOSED: the consultative flow is STATELESS ──────────────────
//
// OWNER DECISION, 2026-08-20. Two complete implementations of one feature existed:
//
//   RC   (2026-08-17)  stateless — need, stage and trip context are re-derived from the message
//                      history on every turn. This is what UAT ran against.
//   D3   (2026-08-19)  Redis-persisted conversation state, pre-search gates, deterministic
//                      non-LLM replies. Built on a base 174 commits older.
//
// The decision is KEEP RC. The priority given was a stable release on the minimum necessary
// architecture, with no unverified architecture dependency introduced — and server-side state in
// Redis is exactly such a dependency: it would change chat behaviour in production, in a way this
// environment cannot exercise (no SERPER key, Google Places 403 locally).
//
// This file exists because that decision is invisible in the code. Nothing in `/api/chat` says
// "there is deliberately no conversation state here", so the next person to open the D3 branch
// sees a large, tested, apparently-better implementation and no record of why it was left. These
// assertions are that record, and they fail if the decision is quietly reversed.

const ROUTE = 'src/app/api/chat/route.ts'
const route = () => readFileSync(ROUTE, 'utf8')

describe('the chat route derives consultative context, it does not store it', () => {
  it('re-derives the need profile from the message history every turn', () => {
    // The stateless mechanism itself. `deriveNeedProfile(messages, …)` folds the whole
    // conversation each turn — no store to read, nothing to expire, nothing to key on a client id.
    expect(route()).toMatch(/deriveNeedProfile\(\s*messages/)
  })

  it('re-derives the decision stage and trip context the same way', () => {
    expect(route()).toMatch(/resolveDecisionStage\(messages\)/)
    expect(route()).toMatch(/resolveTripContext\(messages\)/)
  })

  it('no server-side conversation store is read or written', () => {
    const source = route()
    for (const token of ['loadState', 'saveState', 'conversationState', 'ownerScopeFor']) {
      expect(source).not.toContain(token)
    }
  })

  it('no conversation-state id is minted, read or returned', () => {
    // The client-visible half of the same decision. If this header ever appears, Android and iOS
    // have to start round-tripping an id, and the stateless property is gone from the contract
    // rather than just from the implementation.
    expect(route()).not.toContain('X-Conversation-Id')
  })

  it('the stateful modules are not in the tree at all', () => {
    // Absent rather than present-and-unused: dead code in a release candidate is worse than no
    // code, and every one of these still lives on `feat/consultative-d3`, which is pushed.
    for (const module of [
      'conversationState',
      'stateContext',
      'consultationDelta',
      'recommendationDecision',
      'noCandidateResponse',
      'placePreSearch',
      'productPreSearch',
    ]) {
      expect(existsSync(`src/lib/ai/${module}.ts`)).toBe(false)
    }
  })
})

describe('the clients stayed stateless too', () => {
  it('Android sends no conversation id and reads no state header', () => {
    // D3 added exactly this to ChatRequest/ChatRepository. Under the stateless decision it would
    // send a field the server ignores and wait for a header the server never sends — and the same
    // D3 commit would have reverted the release branch's TTS and voice-language work along with it.
    const request = readFileSync(
      'android/app/src/main/java/com/tappyai/app/chat/data/ChatRequest.kt', 'utf8')
    expect(request).not.toContain('conversationId')
    const repo = readFileSync(
      'android/app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt', 'utf8')
    expect(repo).not.toContain('X-Conversation-Id')
  })

  it('iOS reads no conversation-state header from /api/chat', () => {
    // 🔑 `conversationId` DOES appear in this file and is correct there — it is the Supabase
    // chat-history ROW id, used by the feedback endpoints. D3's own comment drew the same
    // distinction: different lifetime, different owner, and reusing one for the other would key
    // server state on a client-supplied row id. So the assertion is about the streaming request,
    // not about the word.
    const service = readFileSync('ios/TappyAI/Features/Chat/Data/ChatService.swift', 'utf8')
    expect(service).not.toContain('X-Conversation-Id')
    // Every mention of the word is inside a feedback call, where it means the history row. If one
    // ever appears anywhere else in this file, that is a chat request starting to carry state.
    const mentions = service.split(/\r?\n/).filter(l => l.includes('conversationId'))
    expect(mentions.length).toBeGreaterThan(0)
    for (const line of mentions) {
      expect(line, `unexpected conversationId use: ${line.trim()}`)
        .toMatch(/func (save|delete)Feedback|"conversationId": conversationId/)
    }
  })

  it('the release branch chat work that D3 predates is still here', () => {
    // The concrete thing a wholesale merge would have removed. Named so the cost of reversing the
    // decision is visible rather than discovered afterwards.
    const vm = readFileSync(
      'android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt', 'utf8')
    expect(vm).toContain('VoiceLanguageRepository')
    expect(vm).toContain('MessageLanguage')
  })
})

describe('exactly one model request per chat turn, still', () => {
  it('there is a single AI.stream call site in the route', () => {
    // The architecture lock this release ships under. D3's decision turn would have added a
    // second, forced-tool call site — which is why `toolChoice` was added during integration and
    // then reverted: its only consumer is not here, and it breaks
    // consultative/architectureLock.test.ts, which is a tested RC contract.
    const calls = route().match(/AI\.stream\(\{/g) ?? []
    expect(calls).toHaveLength(1)
  })

  it('the AI layer offers no tool forcing', () => {
    const types = readFileSync('src/lib/ai/llm/types.ts', 'utf8')
    expect(types).not.toContain('toolChoice')
    const ai = readFileSync('src/lib/ai/llm/ai.ts', 'utf8')
    expect(ai).not.toContain('toolChoice')
  })

  it('no multi-LLM router was introduced', () => {
    // Out of V2 scope by standing decision. Named here because the D3 branch carries it and a
    // future merge would bring it along without anyone choosing it.
    expect(existsSync('src/lib/ai/llm/routing')).toBe(false)
    expect(route()).not.toContain('deriveChatRoutingHints')
  })
})

describe('what WAS taken from D3 is still here', () => {
  it('the decision and rejection stages', () => {
    const intent = readFileSync('src/lib/ai/intent.ts', 'utf8')
    expect(intent).toContain("'decision'")
    expect(intent).toContain("'rejection'")
    expect(intent).toContain('DECISION_REQUEST')
    expect(intent).toContain('CONSTRAINT_ADDITION')
  })

  it('the prompt blocks those stages need', () => {
    const builder = readFileSync('src/lib/ai/promptBuilder.ts', 'utf8')
    expect(builder).toContain("decisionStage === 'decision'")
    expect(builder).toContain("decisionStage === 'rejection'")
    expect(builder).toContain('closingBlock')
  })

  it('the security boundary and the fencing', () => {
    expect(route()).toContain('validateClientInput')
    expect(route()).toContain('fenceUntrusted')
    expect(existsSync('src/lib/ai/security/clientInput.ts')).toBe(true)
    expect(existsSync('src/lib/ai/security/fence.ts')).toBe(true)
  })

  it('the memory ownership fix', () => {
    // `{ user_id, ...newData }` let any candidate field overwrite ownership. The order is the fix.
    const memory = readFileSync('src/lib/memory/memoryService.ts', 'utf8')
    expect(memory).toMatch(/\{ \.\.\.patch, user_id: userId/)
    expect(memory).toContain('sanitizeMemoryPatch')
  })

  it('the production fixes a wholesale merge would have reverted', () => {
    // Each one shipped AFTER D3 forked. This is the list that made "merge the branch" the wrong
    // instruction, and it is asserted so that reversing the decision has to confront it.
    const intent = readFileSync('src/lib/ai/intent.ts', 'utf8')
    expect(intent).toContain('EN_FUNCTION_WORDS')

    const builder = readFileSync('src/lib/ai/promptBuilder.ts', 'utf8')
    expect(builder).toContain("vi: 'Vietnamese'")
    expect(builder).toContain('18b) REVIEW TIKTOK')

    const common = readFileSync('src/lib/ai/tools/common.ts', 'utf8')
    expect(common).toContain('MIN_PLAUSIBLE_PRICE_VND')

    // The double-encoding fix: the prompt block must be real Vietnamese, not mojibake.
    expect(route()).toContain('SỞ THÍCH & THÔNG TIN CÁ NHÂN')
    expect(route()).not.toContain('Sá»ž')
  })
})

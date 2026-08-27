import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// ── V2-UAT-002 — SUPERSEDED by ADR-024, 2026-08-24 ──────────────────────────
//
// WHAT THIS FILE USED TO SAY
//
// OWNER DECISION, 2026-08-20: the consultative flow is STATELESS. Two complete
// implementations existed — RC (stateless, re-derives everything from history)
// and D3 (Redis-persisted conversation state, pre-search gates, deterministic
// non-LLM replies). The decision was KEEP RC, on the grounds that server-side
// state was an unverified architecture dependency this environment could not
// exercise. These assertions were the record of that, so it could not be
// reversed by accident.
//
// WHAT REVERSED IT
//
// It was not reversed by accident. Two authenticated production UAT sessions
// against 7deee03 measured, on the follow-up turn "Trong các lựa chọn trên, bạn
// chọn cái nào cho tôi?":
//
//     "khoảng 28-29 triệu"              actual price 24,490,000
//     "Google Maps 4.8⭐"                evidence was a PRODUCT rating of 4.7
//     "các shop khác cao hơn 1-2 triệu"  real deltas +509k … +5,060,000
//
// That turn correctly made ZERO tool calls. It had no listing table, because
// `/api/chat` stored nothing and `clientInput` lets a client send only `user`
// and `assistant` roles — so the `tool` message carrying the evidence cannot
// come back. The stateless premise was that history is enough to re-derive the
// turn. For NEED, STAGE and TRIP CONTEXT that is still true: they are functions
// of what was said. For PRODUCT FACTS it is false, and was always false —
// price, rating and RAM were never in the conversation to re-derive.
//
// Two prompt-only fixes (#171, #172) shipped against this and both still failed
// in production at the same rate. A rule cannot restore data that is absent.
//
// OWNER APPROVED the reversal on 2026-08-24, scoped to decision evidence ONLY.
// See docs/architecture/ADR-024-decision-evidence-state.md.
//
// 🚨 WHAT THIS FILE NOW GUARDS
//
// The reversal is NARROW, and narrowness is the whole safety argument. The
// assertions below no longer say "there is no state" — they say "the state is
// exactly this and nothing more": authoritative product facts, owned by
// auth.uid(), never sourced from the client. Everything D3 also wanted —
// conversation persistence, pre-search gates, non-LLM replies — is still out,
// and still asserted absent.

const ROUTE = 'src/app/api/chat/route.ts'
const route = () => readFileSync(ROUTE, 'utf8')
/** Source with comments stripped, so prose about a rejected option cannot trip a check. */
const routeCode = () => route()
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the chat route still DERIVES conversational context, it does not store it', () => {
  it('re-derives the need profile from the message history every turn', () => {
    // Unchanged by ADR-024. The need is a function of what the user said, so it
    // has nothing to gain from a store and everything to lose from a stale one.
    expect(route()).toMatch(/deriveNeedProfile\(\s*messages/)
  })

  it('re-derives the decision stage and trip context the same way', () => {
    expect(route()).toMatch(/resolveDecisionStage\(messages\)/)
    expect(route()).toMatch(/resolveTripContext\(messages\)/)
  })

  it('stores no messages, no need profile, no stage and no trip context', () => {
    // The line between ADR-024 and general conversation persistence. Only
    // product FACTS are stored; anything derivable from history stays derived.
    const src = routeCode()
    for (const forbidden of ['saveNeedProfile', 'loadNeedProfile', 'saveStage', 'saveMessages', 'conversationState', 'ownerScopeFor']) {
      expect(src, `${forbidden} would be conversation persistence, which ADR-024 does not authorize`)
        .not.toContain(forbidden)
    }
  })

  it('the D3 stateful modules are still absent from the tree', () => {
    // ADR-024 reversed the storage decision, NOT the decision to reject D3's
    // pre-search gates and deterministic non-LLM replies. Dead code in a release
    // is worse than no code; every one of these still lives on the branch.
    for (const moduleName of [
      'conversationState', 'stateContext', 'consultationDelta', 'recommendationDecision',
      'noCandidateResponse', 'placePreSearch', 'productPreSearch',
    ]) {
      expect(existsSync(`src/lib/ai/${moduleName}.ts`)).toBe(false)
    }
  })

  // NOTE: "exactly one model call" is asserted in its own describe further down,
  // unchanged from before ADR-024. A "verify the draft" second pass is the
  // obvious next idea and is explicitly OUT of this ADR's scope, so that
  // assertion matters more now, not less.
})

describe('ADR-024 — decision evidence state, and only that', () => {
  it('mints a server-side key and returns it as its own header', () => {
    // NOT X-Conversation-Id. That header belonged to D3's conversation state and
    // meant a different thing with a different lifetime; reviving the name would
    // re-open a contract this project deliberately closed.
    expect(routeCode()).toContain("finalResponse.headers.set('X-Decision-Evidence-Id', evidenceId)")
    expect(routeCode()).not.toContain('X-Conversation-Id')
  })

  it('the key is minted before the stream, because headers commit first', () => {
    const src = routeCode()
    expect(src.slice(0, src.indexOf('AI.stream('))).toContain('const evidenceId = randomUUID()')
  })

  it('reads and writes evidence only through the ownership-checked RPCs', () => {
    const src = routeCode()
    expect(src).toContain('decision_evidence_save')
    expect(src).toContain('decision_evidence_load')
    // Never the table. A direct query would bypass the auth.uid() predicate that
    // is the entire security model.
    expect(src).not.toMatch(/from\(['"]decision_evidence['"]\)/)
  })

  it('takes only a KEY from the client, never a fact', () => {
    // The rejected design had the page echo the evidence back, which would let a
    // client dictate the price the assistant quotes.
    expect(routeCode()).toContain('readDecisionEvidenceId(rawBody)')
    const validator = readFileSync('src/lib/ai/security/clientInput.ts', 'utf8')
    expect(validator).toContain('readDecisionEvidenceId')
    // Roles stay server-owned: a `tool` message still cannot originate at a client.
    expect(validator).toContain("const ALLOWED_ROLES = ['user', 'assistant'] as const")
  })

  it('fails safe when evidence is missing, expired or foreign', () => {
    // The one branch that must never be "carry on and reconstruct".
    expect(routeCode()).toContain('renderMissingEvidenceBlock()')
    expect(routeCode()).toContain('priorEvidenceMissing')
  })

  it('the store is locked to its owner in SQL, not in the route', () => {
    const sql = readFileSync('supabase/migrations/20260824_decision_evidence_state.sql', 'utf8')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('SECURITY DEFINER')
    // Ownership is taken from auth.uid() inside the function; it is never an argument.
    expect(sql).toMatch(/owner_id\s*=\s*auth\.uid\(\)/)
    expect(sql).toMatch(/expires_at\s*>\s*now\(\)/)
    expect(sql).not.toMatch(/decision_evidence_load\s*\(\s*p_id\s+UUID\s*,\s*p_owner/i)
  })
})

describe('the mobile clients stayed stateless', () => {
  it('Android sends no chat-state id and reads no state header', () => {
    // ADR-024 is web-only by design. Android and iOS simply do not send a key, so
    // their follow-ups get the fail-safe block — honest, if less useful — and no
    // release is blocked on a mobile change.
    const request = readFileSync(
      'android/app/src/main/java/com/tappyai/app/chat/data/ChatRequest.kt', 'utf8')
    expect(request).not.toContain('conversationId')
    expect(request).not.toContain('decisionEvidenceId')
    const repo = readFileSync(
      'android/app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt', 'utf8')
    expect(repo).not.toContain('X-Conversation-Id')
    expect(repo).not.toContain('X-Decision-Evidence-Id')
  })

  it('iOS reads no chat-state header from /api/chat', () => {
    // 🔑 `conversationId` DOES appear in this file and is correct there — it is the
    // Supabase chat-history ROW id, used by the feedback endpoints. Different
    // lifetime, different owner. The assertion is about the streaming request.
    const service = readFileSync('ios/TappyAI/Features/Chat/Data/ChatService.swift', 'utf8')
    expect(service).not.toContain('X-Conversation-Id')
    expect(service).not.toContain('X-Decision-Evidence-Id')
    const mentions = service.split(/\r?\n/).filter(l => l.includes('conversationId'))
    expect(mentions.length).toBeGreaterThan(0)
    for (const line of mentions) {
      expect(line, `unexpected conversationId use: ${line.trim()}`)
        .toMatch(/func (save|delete)Feedback|"conversationId": conversationId/)
    }
  })

  it('the release branch chat work that D3 predates is still here', () => {
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
    // Rule 18b's title was renamed from "REVIEW TIKTOK" to "REVIEW & SOCIAL LINK" in
    // Round 2 wiring, when the pipeline started supplying a structured `review_actions`
    // array on each place. The rule itself still shipped after D3 forked — anchor on
    // the shared prefix ("18b) REVIEW") so the wholesale-merge guard survives the rename.
    expect(builder).toMatch(/^18b\) REVIEW/m)

    const common = readFileSync('src/lib/ai/tools/common.ts', 'utf8')
    expect(common).toContain('MIN_PLAUSIBLE_PRICE_VND')

    // The double-encoding fix: the prompt block must be real Vietnamese, not mojibake.
    expect(route()).toContain('SỞ THÍCH & THÔNG TIN CÁ NHÂN')
    expect(route()).not.toContain('Sá»ž')
  })
})

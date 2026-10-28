// ── Wave 2 · behaviour flags of the consultative route ────────────────────────────────────────────────────────────────────────────────
//
// Each flag is OFF unless its variable is EXACTLY "1" (anything else - unset, "0", "true", "on", " 1" - is OFF). OFF is the old behaviour, byte for byte: every call site below does
// nothing different when the flag is OFF. Production keeps them unset until the Owner approves. The benchmark states each one explicitly (scripts/uat/consultUat/liveTrial.ts).
//
//   CONSULT_FINAL_SYNTHESIS     a tool loop that used every step without writing still ends with a written answer (one synthesis step, no more tool calls).
//                               Wave 4 (C-PRE-1): that guard only stopped a tool from RUNNING, so a model that kept calling tools to the last step still wrote nothing; now a loop that
//                               streamed no text at all but ran tools gets ONE extra call with NO tools (finalWrite.ts), written from the tool results, before the finish frame.
//   CONSULT_ANSWER_ATTRIBUTION  what a user message IS (an answer to the question just asked, or a new request) is decided by one shared function, from structure
//   CONSULT_GENERAL_ASSISTANT   the scope block no longer tells the model to refuse general-knowledge questions; sensitive topics are answered with care (not refused)
//   CONSULT_TRACE_DIAGNOSTICS   (Wave 2C) observability only: structured `tappyai_trace` log lines (attribution label, tool states and result previews, intent merge, tool loop). It never
//                               changes what the user gets. It is ONLY honoured outside production: a production runtime (NODE_ENV or VERCEL_ENV "production") reads it as OFF even if it is "1".
//   CONSULT_SEARCH_NOW_INTENT_GATE  (Wave 2D · C) a turn the intent layer read as plain conversation / knowledge ("chat") and that carries no stated place never starts a place lookup by
//                               itself (the code-side pre-search from a capitalised name, the search-now directive a "gần đây" word forces), and a place lookup that failed for want of
//                               a location on such a turn is not turned into the area question. Place requests are untouched. Like the trace flag it is ONLY honoured outside production.
//   CONSULT_THREAD_AWARE_ASK    (Wave 2D · A) a follow-up reads the WHOLE thread and the products already shown: a message that points at a shown product (from the card's own names) continues
//                               that product instead of starting a new request, a question is dropped from the ask card when the user's earlier words, a value the intent layer checked against
//                               those words, or the shown product already answer it, and a rules / intent disagreement on ask vs pick is settled on that evidence (not "rules always win").
//                               Like the trace flag it is ONLY honoured outside production.
//   CONSULT_ABORT_ABANDONED_FIRST_PART  (Wave 2I · A) when a model gives no first part in time and the fallback takes over, the abandoned call is CANCELLED (its signal is aborted, a stream that
//                               arrives late is cancelled) and its spend reservation is closed as UNKNOWN with the reason `abandoned_first_part_timeout`, never left "held". The cost of that
//                               call stays unknown (the paid-run gate still stops). Like the trace flag it is ONLY honoured outside production.
//   CONSULT_KNOWLEDGE_TURN_TOOLS  (Wave 2I · B) on a turn the search-now gate (C) blocked, the model is also given web_search, and the area question is not appended when the model's own place
//                               lookup failed for want of a location and the rules did not read the message as a place request. Needs CONSULT_SEARCH_NOW_INTENT_GATE too. Only honoured outside production.
//   CONSULT_TOOL_BY_NEED          (Wave 3 · W2) every LEAN consult turn (not only a turn the gate blocked) is also offered web_search next to its area tools, one GENERAL line says which tool a need
//                               uses (fresh facts / figures / prices / hours / rules need a source -> web_search; a request to go somewhere -> the place tool; stable knowledge -> answer directly)
//                               and web_search carries a general description of when to use it. The model chooses. Needs CONSULT_SEARCH_NOW_INTENT_GATE too. Only honoured outside production.
//   CONSULT_DETERMINISTIC_MATH    (Wave 3 · W4) every lean consult turn is also offered `calculate`, an exact decimal calculator (hand-written parser, no eval) for sums of money, instalments, interest,
//                               shares and percentages, and one general line says arithmetic goes through it. The model chooses; nothing is computed by the code on its own. Only honoured outside production.
//   CONSULT_RESEARCH_LOOP         (Wave 3 · W1) a lean consult turn that carries tools is also offered `read_page` (the agent runtime's safe page reader, robots.txt honoured, only links that appeared in this turn's results),
//                               gets six model steps instead of three with the last two kept for writing (four tool rounds: search, read, search again, read), and one general line on how to compare. Pages the turn read
//                               count as evidence for the amounts they state. The model chooses; nothing is read on its own. Only honoured outside production.
//   CONSULT_STRUCTURED_SYNTHESIS  (Wave 3 · W3) the writing step of a lean consult turn gets a shape block for a request with SEVERAL parts (the model counts them): a short conclusion first, one section per part, a
//                               table when two or more options are compared, "chưa xác minh" in every cell without data, sources with the date they were read, and what is still unverified. A single simple decision keeps the
//                               short "chốt một lựa chọn" form. The output ceiling of such a turn is 3.500 tokens (under the hard 4.000), and the sentence cap of the prose-shape guard is not applied to it. Only honoured outside production.
//   CONSULT_KNOWLEDGE_PATH        (Wave 4 · Q1) the non-lean free-chat consult turn (R3) keeps its old tools and also gets read_page, calculate and the by-need search description, with steps by level.
//                               Follows the level from L2. Only honoured outside production.
//   CONSULT_PICK_TURN_TOOLS       (Wave 4 · Q2) a lean turn the code pre-searched (R2) also offers the model web_search, read_page and calculate. Follows the level from L2. Only honoured outside production.
//   CONSULT_CAPABILITY_LEVEL      (Wave 3 · W6) 0-4: one number that switches W2 / W4 (L1), W1 (L2), W3 (L3) on together; L4 deepens the loop. See the block of that name below. Level 0 and production = nothing.

type Env = Record<string, string | undefined>

export const CONSULT_FINAL_SYNTHESIS_FLAG = 'CONSULT_FINAL_SYNTHESIS'
export const CONSULT_ANSWER_ATTRIBUTION_FLAG = 'CONSULT_ANSWER_ATTRIBUTION'
export const CONSULT_GENERAL_ASSISTANT_FLAG = 'CONSULT_GENERAL_ASSISTANT'

export const CONSULT_TRACE_DIAGNOSTICS_FLAG = 'CONSULT_TRACE_DIAGNOSTICS'
export const CONSULT_SEARCH_NOW_INTENT_GATE_FLAG = 'CONSULT_SEARCH_NOW_INTENT_GATE'
export const CONSULT_THREAD_AWARE_ASK_FLAG = 'CONSULT_THREAD_AWARE_ASK'
export const CONSULT_ABORT_ABANDONED_FIRST_PART_FLAG = 'CONSULT_ABORT_ABANDONED_FIRST_PART'
export const CONSULT_KNOWLEDGE_TURN_TOOLS_FLAG = 'CONSULT_KNOWLEDGE_TURN_TOOLS'
export const CONSULT_TOOL_BY_NEED_FLAG = 'CONSULT_TOOL_BY_NEED'
export const CONSULT_DETERMINISTIC_MATH_FLAG = 'CONSULT_DETERMINISTIC_MATH'
export const CONSULT_RESEARCH_LOOP_FLAG = 'CONSULT_RESEARCH_LOOP'
export const CONSULT_STRUCTURED_SYNTHESIS_FLAG = 'CONSULT_STRUCTURED_SYNTHESIS'
export const CONSULT_KNOWLEDGE_PATH_FLAG = 'CONSULT_KNOWLEDGE_PATH'
export const CONSULT_PICK_TURN_TOOLS_FLAG = 'CONSULT_PICK_TURN_TOOLS'

const exactlyOne = (v: string | undefined): boolean => v === '1'
/** A production runtime: Vercel production, or a production build (which a Vercel preview also is). Local dev (`next dev`), the bench and tests are not. */
export const isProductionRuntime = (env: Env = process.env): boolean => env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'

export function consultFinalSynthesisOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_FINAL_SYNTHESIS_FLAG]) }
/** Wave 4 fix N1: the final writing call C-PRE-1 added (a new paid model call) runs only outside a production runtime. The flag's older behaviour (the reserve guard) is untouched. */
export function consultFinalWriteOn(env: Env = process.env): boolean { return consultFinalSynthesisOn(env) && !isProductionRuntime(env) }
export function consultAnswerAttributionOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_ANSWER_ATTRIBUTION_FLAG]) }
export function consultGeneralAssistantOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_GENERAL_ASSISTANT_FLAG]) }
/** ON only for the exact value "1" AND only outside a production runtime (local, dev-multi bench, tests). */
export function consultTraceDiagnosticsOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_TRACE_DIAGNOSTICS_FLAG]) && !isProductionRuntime(env) }
/** Wave 2D · C. ON only for the exact value "1" AND only outside a production runtime (the Owner has not approved it for production). */
export function consultSearchNowIntentGateOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_SEARCH_NOW_INTENT_GATE_FLAG]) && !isProductionRuntime(env) }
/** Wave 2D · A. ON only for the exact value "1" AND only outside a production runtime (the Owner has not approved it for production). */
export function consultThreadAwareAskOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_THREAD_AWARE_ASK_FLAG]) && !isProductionRuntime(env) }
/** Wave 2I · A. ON only for the exact value "1" AND only outside a production runtime. */
export function consultAbortAbandonedFirstPartOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_ABORT_ABANDONED_FIRST_PART_FLAG]) && !isProductionRuntime(env) }
/** Wave 2I · B. ON only for the exact value "1", only outside a production runtime, and only together with the search-now gate (C). */
export function consultKnowledgeTurnToolsOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_KNOWLEDGE_TURN_TOOLS_FLAG]) && !isProductionRuntime(env) && consultSearchNowIntentGateOn(env) }
/**
 * Wave 4 · C-PRE-2. ON only for the exact value "1" AND only outside a production runtime. NOT tied to the capability level (a product decision for the Owner): on a turn the intent layer reads as free
 * chat, a domain reaches the lean (venue) path only when BOTH readers - the intent layer and the rules - named it (see agreedChatDecision in consultative/luna.ts).
 */
export const CONSULT_CHAT_DOMAIN_AGREEMENT_FLAG = 'CONSULT_CHAT_DOMAIN_AGREEMENT'
export function consultChatDomainAgreementOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_CHAT_DOMAIN_AGREEMENT_FLAG]) && !isProductionRuntime(env) }
// ── Wave 3 · W6 · capability levels L0-L4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// CONSULT_CAPABILITY_LEVEL is one number that switches the Wave 3 capabilities on together, so a paid run can be priced level by level:
//   L0  the product as it is (no Wave 3 flag)             L1  + W2 tool by need + W4 calculator     L2  + W1 research loop (search, read, search again)
//   L3  + W3 structured synthesis                          L4  = L3 with a deeper loop (8 steps, 6 pages) and the full 4.000-token output ceiling of a structured answer
// Only the single characters 0-4 are a level; anything else (unset, "5", "01", "L2", " 2") is level 0. A production runtime is level 0 whatever the variable says.
// A Wave 3 flag that is SET (to anything) decides for itself: "1" is on, any other value is off, even when the level would switch it on; an unset flag follows the level.
// W2 still needs the search-now gate (CONSULT_SEARCH_NOW_INTENT_GATE=1, a Wave 2 flag): without it W2 is inert and the launcher says so. L4's higher reasoning effort for the writing step is NOT set by
// code: it needs the existing LLM_<ROLE>_REASONING configuration (and the Responses API for tool calls), a deployment decision recorded in the Wave 3 report.
export const CONSULT_CAPABILITY_LEVEL_FLAG = 'CONSULT_CAPABILITY_LEVEL'
export type CapabilityLevel = 0 | 1 | 2 | 3 | 4
/** The level each Wave 3 flag is switched on from. */
export const CAPABILITY_FLAG_LEVELS: Readonly<Record<string, CapabilityLevel>> = {
  [CONSULT_TOOL_BY_NEED_FLAG]: 1, [CONSULT_DETERMINISTIC_MATH_FLAG]: 1, [CONSULT_RESEARCH_LOOP_FLAG]: 2, [CONSULT_STRUCTURED_SYNTHESIS_FLAG]: 3,
  // Wave 4 (Owner Q4 27/10): the two path flags follow the level from L2 (L1 does not switch them on); a set flag decides for itself.
  [CONSULT_KNOWLEDGE_PATH_FLAG]: 2, [CONSULT_PICK_TURN_TOOLS_FLAG]: 2,
}
/** Pure. The capability level: a single character 0-4, never in a production runtime; anything else is 0. */
export function capabilityLevel(env: Env = process.env): CapabilityLevel {
  if (isProductionRuntime(env)) return 0
  const v = env[CONSULT_CAPABILITY_LEVEL_FLAG]
  return v !== undefined && /^[0-4]$/.test(v) ? (Number(v) as CapabilityLevel) : 0
}
/** Pure. Is this Wave 3 flag switched on by its own value or, when it is unset, by the level? (Production and flag dependencies are applied by the callers.) */
function waveFlag(env: Env, name: string): boolean {
  const v = env[name]
  return v !== undefined ? exactlyOne(v) : capabilityLevel(env) >= (CAPABILITY_FLAG_LEVELS[name] ?? 5)
}
/** The model steps the final-synthesis / research guard keeps for WRITING: it answers a tool call made at `stepsFinished >= maxSteps - 2` with "search budget used" instead of running it. */
export const FINAL_SYNTHESIS_RESERVED_STEPS = 2
/** Pure. Has the guard's reserve been reached (a tool call now is answered by code, not run)? One step must have finished, and only the reserved steps may be left. */
export function finalSynthesisReserveReached(stepsFinished: number, maxSteps: number): boolean { return stepsFinished >= 1 && stepsFinished >= maxSteps - FINAL_SYNTHESIS_RESERVED_STEPS }
/**
 * Wave 5 · W5-1 (CONSULT_READ_PAGE_LATE). ON only for the exact value "1", outside a production runtime, AND only while the final writing call is armed (consultFinalWriteOn): NOT tied to the level.
 * Measured (W4 runs, 28/10): with six steps the reserve answered a read_page made in step five ("search_budget_used"), so a page the model had just found was never read (E22, E24, E9), although its
 * result would still reach step six, where the model writes. With this flag a read_page call is held back only in the LAST step; every other tool keeps the two-step reserve.
 * The writing guarantee holds: the last step still refuses every tool, and a turn that ends without a word gets the final write (C-PRE-1) - which is why the flag needs it.
 */
export const CONSULT_READ_PAGE_LATE_FLAG = 'CONSULT_READ_PAGE_LATE'
export function consultReadPageLateOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_READ_PAGE_LATE_FLAG]) && !isProductionRuntime(env) && consultFinalWriteOn(env) }
/** Pure. Does the reserve hold this tool call back? read_page with W5-1 on: only in the last step (one step must have finished). Anything else: the two-step reserve, as before. */
export function reserveHoldsToolCall(tool: string, stepsFinished: number, maxSteps: number, readPageLate: boolean): boolean {
  if (readPageLate && tool === 'read_page') return stepsFinished >= 1 && stepsFinished >= maxSteps - 1
  return finalSynthesisReserveReached(stepsFinished, maxSteps)
}
/**
 * Wave 4 · C-PRE-3. Pure. The depth of a turn that carries the page reader but is NOT on the lean path (the knowledge path, C2), by capability level: below L2 the previous five steps, L2-L3 six, L4 eight
 * (the research loop's own budget). `toolRounds` is what the reserve leaves for tools: at five steps the guard allowed THREE lookups and cut the fourth (measured B2 27/10: E18, E22, X2 - four web_search
 * requests each, the fourth answered "search_budget_used" at stepsFinished 3 of 5); six steps allow four, eight allow six.
 */
export function knowledgeDepth(env: Env = process.env): { steps: number; toolRounds: number } {
  const level = capabilityLevel(env)
  const steps = level >= 4 ? 8 : level >= 2 ? 6 : 5
  return { steps, toolRounds: steps - FINAL_SYNTHESIS_RESERVED_STEPS }
}
/** Pure. The limits that change with the level: L4 reads six pages in eight steps and may write up to the hard 4.000-token ceiling. Below L4 they are the Wave 3 defaults. */
export function capabilityLimits(env: Env = process.env): { researchSteps: number; researchMaxReads: number; structuredMaxTokens: number } {
  return capabilityLevel(env) >= 4 ? { researchSteps: 8, researchMaxReads: 6, structuredMaxTokens: 4000 } : { researchSteps: 6, researchMaxReads: 4, structuredMaxTokens: 3500 }
}
/** Pure. Everything the level and the flags decide, in one object (for the launcher, the trace and the tests). W2 is reported as it works: on only together with the gate. */
export function capabilityFlags(env: Env = process.env): { level: CapabilityLevel; toolByNeed: boolean; deterministicMath: boolean; researchLoop: boolean; structuredSynthesis: boolean; limits: ReturnType<typeof capabilityLimits> } {
  return { level: capabilityLevel(env), toolByNeed: consultToolByNeedOn(env), deterministicMath: consultDeterministicMathOn(env), researchLoop: consultResearchLoopOn(env), structuredSynthesis: consultStructuredSynthesisOn(env), limits: capabilityLimits(env) }
}

/**
 * Wave 4 · Q1 (R3, the knowledge path). ON by "1" (or, unset, by level 2+), and only outside a production runtime. A free-chat consult turn that is NOT lean (no domain) and not a planning, image, evening,
 * agent or no-tool turn keeps its old tools and also gets the page reader, the calculator and the by-need search description; steps follow knowledgeDepth (C2).
 */
export function consultKnowledgePathOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_KNOWLEDGE_PATH_FLAG) && !isProductionRuntime(env) }
/**
 * Wave 4 · Q2 (R2, the pre-searched pick). ON by "1" (or, unset, by level 2+), and only outside a production runtime. A lean turn the code pre-searched also offers the model web_search, read_page and
 * calculate (the code's own pre-search is unchanged) (C3).
 */
export function consultPickTurnToolsOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_PICK_TURN_TOOLS_FLAG) && !isProductionRuntime(env) }
/** Wave 3 · W3. ON by "1" (or, unset, by level 3+), and only outside a production runtime. */
export function consultStructuredSynthesisOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_STRUCTURED_SYNTHESIS_FLAG) && !isProductionRuntime(env) }
/** Wave 3 · W1. ON by "1" (or, unset, by level 2+), and only outside a production runtime. It carries its own reserved writing step (it does not need CONSULT_FINAL_SYNTHESIS). */
export function consultResearchLoopOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_RESEARCH_LOOP_FLAG) && !isProductionRuntime(env) }
/** Wave 3 · W4. ON by "1" (or, unset, by level 1+), and only outside a production runtime. */
export function consultDeterministicMathOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_DETERMINISTIC_MATH_FLAG) && !isProductionRuntime(env) }
/** Wave 3 · W2. ON by "1" (or, unset, by level 1+), only outside a production runtime, and only together with the search-now gate (C). */
export function consultToolByNeedOn(env: Env = process.env): boolean { return waveFlag(env, CONSULT_TOOL_BY_NEED_FLAG) && !isProductionRuntime(env) && consultSearchNowIntentGateOn(env) }

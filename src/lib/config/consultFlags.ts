// ── Wave 2 · behaviour flags of the consultative route ────────────────────────────────────────────────────────────────────────────────
//
// Each flag is OFF unless its variable is EXACTLY "1" (anything else - unset, "0", "true", "on", " 1" - is OFF). OFF is the old behaviour, byte for byte: every call site below does
// nothing different when the flag is OFF. Production keeps them unset until the Owner approves. The benchmark states each one explicitly (scripts/uat/consultUat/liveTrial.ts).
//
//   CONSULT_FINAL_SYNTHESIS     a tool loop that used every step without writing still ends with a written answer (one synthesis step, no more tool calls)
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

const exactlyOne = (v: string | undefined): boolean => v === '1'
/** A production runtime: Vercel production, or a production build (which a Vercel preview also is). Local dev (`next dev`), the bench and tests are not. */
export const isProductionRuntime = (env: Env = process.env): boolean => env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'

export function consultFinalSynthesisOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_FINAL_SYNTHESIS_FLAG]) }
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
/** Wave 3 · W4. ON only for the exact value "1" and only outside a production runtime. */
export function consultDeterministicMathOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_DETERMINISTIC_MATH_FLAG]) && !isProductionRuntime(env) }
/** Wave 3 · W2. ON only for the exact value "1", only outside a production runtime, and only together with the search-now gate (C). */
export function consultToolByNeedOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_TOOL_BY_NEED_FLAG]) && !isProductionRuntime(env) && consultSearchNowIntentGateOn(env) }

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

type Env = Record<string, string | undefined>

export const CONSULT_FINAL_SYNTHESIS_FLAG = 'CONSULT_FINAL_SYNTHESIS'
export const CONSULT_ANSWER_ATTRIBUTION_FLAG = 'CONSULT_ANSWER_ATTRIBUTION'
export const CONSULT_GENERAL_ASSISTANT_FLAG = 'CONSULT_GENERAL_ASSISTANT'

export const CONSULT_TRACE_DIAGNOSTICS_FLAG = 'CONSULT_TRACE_DIAGNOSTICS'

const exactlyOne = (v: string | undefined): boolean => v === '1'
/** A production runtime: Vercel production, or a production build (which a Vercel preview also is). Local dev (`next dev`), the bench and tests are not. */
export const isProductionRuntime = (env: Env = process.env): boolean => env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'

export function consultFinalSynthesisOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_FINAL_SYNTHESIS_FLAG]) }
export function consultAnswerAttributionOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_ANSWER_ATTRIBUTION_FLAG]) }
export function consultGeneralAssistantOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_GENERAL_ASSISTANT_FLAG]) }
/** ON only for the exact value "1" AND only outside a production runtime (local, dev-multi bench, tests). */
export function consultTraceDiagnosticsOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_TRACE_DIAGNOSTICS_FLAG]) && !isProductionRuntime(env) }

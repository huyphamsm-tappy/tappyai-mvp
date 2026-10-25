// ── Wave 2 · behaviour flags of the consultative route ────────────────────────────────────────────────────────────────────────────────
//
// Each flag is OFF unless its variable is EXACTLY "1" (anything else - unset, "0", "true", "on", " 1" - is OFF). OFF is the old behaviour, byte for byte: every call site below does
// nothing different when the flag is OFF. Production keeps them unset until the Owner approves. The benchmark states each one explicitly (scripts/uat/consultUat/liveTrial.ts).
//
//   CONSULT_FINAL_SYNTHESIS     a tool loop that used every step without writing still ends with a written answer (one synthesis step, no more tool calls)
//   CONSULT_ANSWER_ATTRIBUTION  what a user message IS (an answer to the question just asked, or a new request) is decided by one shared function, from structure
//   CONSULT_GENERAL_ASSISTANT   the scope block no longer tells the model to refuse general-knowledge questions; sensitive topics are answered with care (not refused)

type Env = Record<string, string | undefined>

export const CONSULT_FINAL_SYNTHESIS_FLAG = 'CONSULT_FINAL_SYNTHESIS'
export const CONSULT_ANSWER_ATTRIBUTION_FLAG = 'CONSULT_ANSWER_ATTRIBUTION'
export const CONSULT_GENERAL_ASSISTANT_FLAG = 'CONSULT_GENERAL_ASSISTANT'

const exactlyOne = (v: string | undefined): boolean => v === '1'

export function consultFinalSynthesisOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_FINAL_SYNTHESIS_FLAG]) }
export function consultAnswerAttributionOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_ANSWER_ATTRIBUTION_FLAG]) }
export function consultGeneralAssistantOn(env: Env = process.env): boolean { return exactlyOne(env[CONSULT_GENERAL_ASSISTANT_FLAG]) }

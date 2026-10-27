// ── Wave 4 · C1: the Wave 3 rule lines of a turn, as one pure function ─────────────────────────────────────────────────────────────────────────────────────
//
// Extracted from the route (Wave 3-FIX R3-04 rule: a rule line goes into the prompt only when its tool is REALLY in the turn's tool set). The lean path and the knowledge path (C2) both call it, so the
// two paths cannot drift apart: a capability that is on but whose tool the turn does not carry adds no line, and the shape block goes to the tail only for a structured turn.
import { TOOL_BY_NEED_RULE, MATH_TOOL_RULE, STRUCTURED_SYNTHESIS_RULE } from './leanConsultPrompt'
import { RESEARCH_RULE } from './researchLoop'

/** Wave 4 · C3 (Owner Q2): what a lean turn the code pre-searched (R2) offers the model when CONSULT_PICK_TURN_TOOLS is on - no place tool (the code already searched). */
export const PICK_TURN_TOOL_NAMES: readonly string[] = ['web_search', 'read_page', 'calculate']

export interface Wave3PromptInput {
  /** The tool names the turn really carries (none for a pre-searched answer, a trip plan or a no-tool turn). */
  offeredToolNames: readonly string[]
  /** The sectioned shape applies (tools offered AND a request with several parts - decided by the caller). */
  structured: boolean
  toolByNeed: boolean
  math: boolean
  research: boolean
}

/** Pure. `extra` goes into the dynamic segment, `tail` after the frame (buildLeanConsultSystem). */
export function wave3PromptLines(o: Wave3PromptInput): { extra: string[]; tail: string[] } {
  return {
    extra: [
      ...(o.toolByNeed && o.offeredToolNames.includes('web_search') ? [TOOL_BY_NEED_RULE] : []),
      ...(o.math && o.offeredToolNames.includes('calculate') ? [MATH_TOOL_RULE] : []),
      ...(o.research && o.offeredToolNames.includes('read_page') ? [RESEARCH_RULE] : []),
    ],
    tail: o.structured ? [STRUCTURED_SYNTHESIS_RULE] : [],
  }
}

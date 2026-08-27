import { describe, it, expect } from 'vitest'
import { classifyTurnIntent, shouldRunRetrieval, shouldRenderCards } from './intentGate'

describe('classifyTurnIntent — Phase A A2', () => {
  it('no prior assistant turn ⇒ new_consultation', () => {
    expect(classifyTurnIntent({
      stage: null,
      hasPriorAssistantTurn: false,
      taskSwitched: false,
      assistantAskedClarification: false,
    })).toBe('new_consultation')
  })

  it('task switch mid-conversation ⇒ new_consultation', () => {
    expect(classifyTurnIntent({
      stage: null,
      hasPriorAssistantTurn: true,
      taskSwitched: true,
      assistantAskedClarification: false,
    })).toBe('new_consultation')
  })

  it('assistant asked a clarification ⇒ clarification_response', () => {
    expect(classifyTurnIntent({
      stage: null,
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: true,
    })).toBe('clarification_response')
  })

  it('refinement stage ⇒ refinement', () => {
    expect(classifyTurnIntent({
      stage: 'refinement',
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: false,
    })).toBe('refinement')
  })

  it('comparison stage ⇒ refinement (re-rank existing set)', () => {
    expect(classifyTurnIntent({
      stage: 'comparison',
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: false,
    })).toBe('refinement')
  })

  it('decision / rejection / confirmation ⇒ follow_up_question', () => {
    for (const stage of ['decision', 'rejection', 'confirmation'] as const) {
      expect(classifyTurnIntent({
        stage,
        hasPriorAssistantTurn: true,
        taskSwitched: false,
        assistantAskedClarification: false,
      })).toBe('follow_up_question')
    }
  })

  it('no signal but has history ⇒ conservative default follow_up_question', () => {
    // Factual follow-up ("giá bao nhiêu?") that doesn't fire the refinement
    // regex must NOT be classified as a new consultation.
    expect(classifyTurnIntent({
      stage: null,
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: false,
    })).toBe('follow_up_question')
  })

  it('task-switch beats an accidental refinement stage on the same input', () => {
    // If the detector flagged refinement but the delta also detected a task
    // switch, task switch wins — refining a shopping decision with a food query
    // is really starting a new consultation.
    expect(classifyTurnIntent({
      stage: 'refinement',
      hasPriorAssistantTurn: true,
      taskSwitched: true,
      assistantAskedClarification: false,
    })).toBe('new_consultation')
  })
})

describe('shouldRunRetrieval / shouldRenderCards', () => {
  it('retrieval runs on new_consultation, refinement, clarification_response', () => {
    expect(shouldRunRetrieval('new_consultation')).toBe(true)
    expect(shouldRunRetrieval('refinement')).toBe(true)
    expect(shouldRunRetrieval('clarification_response')).toBe(true)
  })

  it('retrieval does NOT run on follow_up_question — Round 1 sanitize alone is not the sole guard', () => {
    expect(shouldRunRetrieval('follow_up_question')).toBe(false)
  })

  it('cards render only on new_consultation and refinement', () => {
    expect(shouldRenderCards('new_consultation')).toBe(true)
    expect(shouldRenderCards('refinement')).toBe(true)
    expect(shouldRenderCards('follow_up_question')).toBe(false)
    // Clarification response merges then flows into a new_consultation on the
    // NEXT turn — this turn does not itself render cards, the caller does.
    expect(shouldRenderCards('clarification_response')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { oneBrainTurnTrace } from './turnTrace'

// P2-8 (audit 29/10): one line per one-brain turn that says how the model loop ended - never the text, only counts and names of tools.

const step = (...names: string[]) => ({ toolCalls: names.map(n => ({ toolName: n })), toolResults: names.map(n => ({ toolName: n, result: {} })) })

describe('oneBrainTurnTrace', () => {
  it('counts steps, tools by name, tokens and how the loop ended', () => {
    const t = oneBrainTurnTrace({
      serving: { provider: 'openai', effort: 'none' }, finishReason: 'stop', maxSteps: 8, maxTokens: 4000,
      text: 'câu trả lời', usage: { promptTokens: 1200, completionTokens: 340 },
      steps: [step('search_products'), step('web_search', 'web_search'), step(), { ...step('read_page'), response: { modelId: 'reported-model-x' } }],
    })
    expect(t).toEqual({
      type: 'tappyai_one_brain_turn', response_model: 'reported-model-x', provider: 'openai', effort: 'none', finish_reason: 'stop',
      steps_run: 4, max_steps: 8, step_cap_hit: false, wrote_text: true, text_chars: 11, length_cut: false,
      tools: { search_products: 1, web_search: 2, read_page: 1 }, tool_calls: 4, prompt_tokens: 1200, completion_tokens: 340,
    })
  })
  it('the model that answered is the LAST one reported (a fallback or a re-route shows)', () => {
    const t = oneBrainTurnTrace({ serving: null, finishReason: 'stop', maxSteps: 8, maxTokens: 4000, text: 'x', usage: undefined, steps: [{ ...step('web_search'), response: { modelId: 'first-model' } }, { ...step(), response: { modelId: 'last-model' } }, step()] })
    expect(t.response_model).toBe('last-model')
  })
  it('the step cap reached with no text written is visible (the loop ran out before the answer)', () => {
    const steps = Array.from({ length: 8 }, () => step('web_search'))
    const t = oneBrainTurnTrace({ serving: null, finishReason: 'tool-calls', maxSteps: 8, maxTokens: 4000, text: '', usage: { promptTokens: 1, completionTokens: 1 }, steps })
    expect(t).toMatchObject({ step_cap_hit: true, wrote_text: false, text_chars: 0, finish_reason: 'tool-calls', tool_calls: 8, response_model: null, effort: null })
  })
  it('a reply cut at the output ceiling is flagged', () => {
    expect(oneBrainTurnTrace({ serving: null, finishReason: 'length', maxSteps: 8, maxTokens: 4000, text: 'x', usage: { promptTokens: 1, completionTokens: 4000 }, steps: [] })).toMatchObject({ length_cut: true })
  })
  it('tolerates missing steps, usage and tool names (never throws, never invents)', () => {
    const t = oneBrainTurnTrace({ serving: null, finishReason: undefined, maxSteps: 8, maxTokens: 4000, text: '', usage: undefined, steps: [{ toolCalls: [{}, { toolName: 5 }] } as never] })
    expect(t).toMatchObject({ finish_reason: null, steps_run: 1, tools: {}, tool_calls: 0, prompt_tokens: null, completion_tokens: null })
  })
  it('carries no text and no argument of a tool: only numbers, flags and names', () => {
    const t = oneBrainTurnTrace({ serving: null, finishReason: 'stop', maxSteps: 8, maxTokens: 4000, text: 'một câu có số 12.345.000đ', usage: { promptTokens: 1, completionTokens: 1 }, steps: [{ toolCalls: [{ toolName: 'search_products', args: { query: 'bí mật của người dùng' } }] } as never] })
    expect(JSON.stringify(t)).not.toContain('bí mật')
    expect(JSON.stringify(t)).not.toContain('12.345')
  })
})

describe('wiring', () => {
  it('the route logs it at the end of every one-brain turn', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain("import { oneBrainTurnTrace } from '@/lib/ai/consultative/turnTrace'")
    expect(src).toContain('if (oneBrain) { try { console.log(JSON.stringify(oneBrainTurnTrace({')
  })
})

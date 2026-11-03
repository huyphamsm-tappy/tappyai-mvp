// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildLeakDetector } from '../../consultative/lunaSafety'
import { agentSystemV2For } from './consultativeVoice'

// Round 23 live: a 3-day card whose tips said "Đây là kinh nghiệm chung, không phải dữ kiện đã xác minh" (the model repeating our own wording) hit 3 overlapping
// 10-word windows → prompt_echo → the whole card was replaced by the refusal. The flag-on prompt no longer carries that quotable phrase.
const TIPS = [
  'Đây là kinh nghiệm chung, không phải dữ kiện đã xác minh: hải sản bữa tối nên đặt bàn trước vào cuối tuần.',
  'Mẹo chung (chưa kiểm chứng): đi đảo buổi sáng sớm sẽ ít nắng và vắng hơn, bạn nên mang theo áo chống nắng nhẹ.',
  'Đây là kinh nghiệm chung, không phải dữ kiện đã xác minh, nên bạn cứ hỏi lại quán khi đến nơi.',
].join('\n')

describe('prompt-echo guard vs the flag-on system prompt', () => {
  const prompt = agentSystemV2For(true)
  const detect = buildLeakDetector([prompt])
  it('a plan reply whose tips say "kinh nghiệm chung, không phải dữ kiện đã xác minh" is not a leak', () => {
    expect(detect(TIPS)).toEqual({ leak: false, reason: null })
  })
  it('control: pasting a real stretch of the prompt is still a leak', () => {
    const body = prompt.split('\n').filter(l => l.split(/\s+/).length > 25).slice(0, 2).join('\n')
    expect(body.length).toBeGreaterThan(100)
    expect(detect(body)).toEqual({ leak: true, reason: 'prompt_echo' })
  })
})

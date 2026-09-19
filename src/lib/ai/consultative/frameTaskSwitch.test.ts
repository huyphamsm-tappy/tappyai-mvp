import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { deriveSituation } from './situationFrame'
import { deriveNeedProfile } from './needProfile'
import { taskSwitched, resolveDecisionStage } from './refinement'
import { classifyTurnIntent } from './intentGate'

// ─────────────────────────────────────────────────────────────────────────────
// A TASK SWITCH STARTS THE SITUATION FRAME OVER.
//
// Android E2E turn 5 (Pixel_8_uat, 2026-09-19). The conversation, as the app sent
// it: "quan 1" (food) → "spa nao mo khuya sau 22h o quan 3" (spa, hard
// late_open) → "tim resort o phu quoc sang chut cho 2 nguoi". The intent gate
// said new_consultation (spa → hotel), yet the frame — three user turns folded —
// still carried `late_open` and `time: late_night` from the spa turn. The hotel
// rows have no opening hours, so the hard-constraint net reported the gap and the
// reply hedged "chưa thấy bằng chứng về giờ mở khuya … ở các quán này" about
// resorts nobody asked to be open late. The route now derives the frame from the
// current turn only when the turn is a new consultation.
// ─────────────────────────────────────────────────────────────────────────────

const E2E = [
  { role: 'user', content: 'quan 1' },
  { role: 'assistant', content: 'Ăn trưa dưới 100k ở Quận 1 thì mình chọn **Béo Ơi Quán** — bún chả Hà Nội đúng vị.' },
  { role: 'user', content: 'spa nao mo khuya sau 22h o quan 3' },
  { role: 'assistant', content: 'Mình chưa xác nhận được spa nào mở sau 22h ở Quận 3. **An Miên Spa** mở đến 22:00.' },
  { role: 'user', content: 'tim resort o phu quoc sang chut cho 2 nguoi' },
]
const userTexts = (ms: typeof E2E) => ms.filter(m => m.role === 'user').map(m => m.content)
const need = { budget: null as never, location: { text: 'Phú Quốc', gps: null } }

/** The route's own wiring, composed the way route.ts composes it. */
function frameAsRouted(ms: typeof E2E) {
  const turnIntent = classifyTurnIntent({
    stage: resolveDecisionStage(ms),
    hasPriorAssistantTurn: ms.some(m => m.role === 'assistant'),
    taskSwitched: taskSwitched(ms),
    assistantAskedClarification: false,
  })
  return { turnIntent, frame: deriveSituation(userTexts(ms), need, { hasGps: true, ...(turnIntent === 'new_consultation' ? { window: 1 } : {}) }) }
}

describe('the situation frame on a task switch', () => {
  it('the E2E turn IS a task switch (spa → hotel) — the gate says new_consultation', () => {
    expect(deriveNeedProfile(E2E.slice(0, 3)).domain).toBe('places')
    expect(deriveNeedProfile(E2E).domain).toBe('hotel')
    expect(taskSwitched(E2E)).toBe(true)
    expect(frameAsRouted(E2E).turnIntent).toBe('new_consultation')
  })

  it('🚨 THE DEFECT: the three-turn window carried the spa turn\'s late_open into the resort turn', () => {
    const carried = deriveSituation(userTexts(E2E), need, { hasGps: true })
    expect(carried.hard).toContain('late_open')
    expect(carried.time).toBe('late_night')
  })

  it('as routed: the resort turn\'s frame is its own words only — upscale, couple, no late_open', () => {
    const { frame } = frameAsRouted(E2E)
    expect(frame.hard).toEqual(['upscale'])
    expect(frame.time).toBeNull()
    expect(frame.who).toBe('couple')
    expect(frame.mood).toBe('fancy')
  })

  it('a refinement inside one consultation still folds the earlier turns ("cho 2 người" holds)', () => {
    const ms = [
      { role: 'user', content: 'tìm quán ăn tối cho 2 người ở quận 1' },
      { role: 'assistant', content: 'Mình chọn **Quán A** — không gian ấm cúng.' },
      { role: 'user', content: 'chỗ nào yên tĩnh hơn?' },
    ]
    const { turnIntent, frame } = frameAsRouted(ms)
    expect(turnIntent).not.toBe('new_consultation')
    expect(frame.partySize).toBe(2)
    expect(frame.hard).toContain('quiet')
  })

  it('route.ts passes window 1 on new_consultation — the wiring, not just the helper', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/deriveSituation\([\s\S]{0,400}turnIntent === 'new_consultation' \? \{ window: 1 \} : \{\}/)
  })
})

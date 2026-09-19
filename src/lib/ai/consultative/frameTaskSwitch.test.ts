import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { deriveSituation } from './situationFrame'
import { deriveNeedProfile } from './needProfile'
import { taskSwitched, consultationUserTexts } from './refinement'

// ─────────────────────────────────────────────────────────────────────────────
// A TASK SWITCH STARTS THE SITUATION FRAME OVER — AND STAYS OVER.
//
// Android E2E turns 5–6 (Pixel_8_uat, 2026-09-19). The conversation, as the app
// sent it: "quan 1" (food) → "spa nao mo khuya sau 22h o quan 3" (spa, hard
// late_open) → "tim resort o phu quoc sang chut cho 2 nguoi" → "goi y them".
// The intent gate said new_consultation on the resort turn (places → hotel), yet
// the frame — three user turns folded — still carried `late_open` and
// `time: late_night` from the spa turn, on the resort turn AND on the "gợi ý
// thêm" refinement after it. The hotel rows have no opening hours, so the
// hard-constraint net reported the gap and both replies hedged "chưa thấy bằng
// chứng về giờ mở khuya … ở các quán này" about resorts nobody asked to be open
// late. The route now folds only the user turns since the last task switch.
// ─────────────────────────────────────────────────────────────────────────────

const E2E = [
  { role: 'user', content: 'quan 1' },
  { role: 'assistant', content: 'Ăn trưa dưới 100k ở Quận 1 thì mình chọn **Béo Ơi Quán** — bún chả Hà Nội đúng vị.' },
  { role: 'user', content: 'spa nao mo khuya sau 22h o quan 3' },
  { role: 'assistant', content: 'Mình chưa xác nhận được spa nào mở sau 22h ở Quận 3. **An Miên Spa** mở đến 22:00.' },
  { role: 'user', content: 'tim resort o phu quoc sang chut cho 2 nguoi' },
  { role: 'assistant', content: 'Mình chọn **Ocean Bay Resort & Spa Phú Quốc** cho bạn — 4.7⭐ (3.176 đánh giá).' },
  { role: 'user', content: 'goi y them' },
]
const allUserTexts = (ms: typeof E2E) => ms.filter(m => m.role === 'user').map(m => m.content)
const need = { budget: null as never, location: { text: 'Phú Quốc', gps: null } }

describe('consultationUserTexts — the user turns since the last task switch', () => {
  it('the E2E resort turn IS a task switch (places → hotel)', () => {
    expect(deriveNeedProfile(E2E.slice(0, 3)).domain).toBe('places')
    expect(deriveNeedProfile(E2E.slice(0, 5)).domain).toBe('hotel')
    expect(taskSwitched(E2E.slice(0, 5))).toBe(true)
  })

  it('on the switch turn: the resort turn alone', () => {
    expect(consultationUserTexts(E2E.slice(0, 5))).toEqual(['tim resort o phu quoc sang chut cho 2 nguoi'])
  })

  it('on the refinement after it: the resort turn and the refinement — never the spa turn', () => {
    expect(consultationUserTexts(E2E)).toEqual(['tim resort o phu quoc sang chut cho 2 nguoi', 'goi y them'])
  })

  it('no switch anywhere ⇒ every user text, exactly as the frame read before', () => {
    const ms = [
      { role: 'user', content: 'tìm quán ăn tối cho 2 người ở quận 1' },
      { role: 'assistant', content: 'Mình chọn **Quán A** — không gian ấm cúng.' },
      { role: 'user', content: 'chỗ nào yên tĩnh hơn?' },
    ]
    expect(consultationUserTexts(ms)).toEqual(allUserTexts(ms))
  })
})

describe('the situation frame, as routed', () => {
  it('🚨 THE DEFECT: folding every user turn carried the spa turn\'s late_open into both resort turns', () => {
    for (const ms of [E2E.slice(0, 5), E2E]) {
      const carried = deriveSituation(allUserTexts(ms), need, { hasGps: true })
      expect(carried.hard).toContain('late_open')
      expect(carried.time).toBe('late_night')
    }
  })

  it('the resort turn: upscale, couple, fancy — no late_open, no late_night', () => {
    const frame = deriveSituation(consultationUserTexts(E2E.slice(0, 5)), need, { hasGps: true })
    expect(frame.hard).toEqual(['upscale'])
    expect(frame.time).toBeNull()
    expect(frame.who).toBe('couple')
    expect(frame.mood).toBe('fancy')
  })

  it('the "gợi ý thêm" refinement keeps the resort turn\'s frame ("cho 2 người" holds) and still no late_open', () => {
    const frame = deriveSituation(consultationUserTexts(E2E), need, { hasGps: true })
    expect(frame.hard).toEqual(['upscale'])
    expect(frame.time).toBeNull()
    expect(frame.partySize).toBe(2)
  })

  it('a refinement inside one consultation still folds the earlier turns', () => {
    const ms = [
      { role: 'user', content: 'tìm quán ăn tối cho 2 người ở quận 1' },
      { role: 'assistant', content: 'Mình chọn **Quán A** — không gian ấm cúng.' },
      { role: 'user', content: 'chỗ nào yên tĩnh hơn?' },
    ]
    const frame = deriveSituation(consultationUserTexts(ms), need, { hasGps: true })
    expect(frame.partySize).toBe(2)
    expect(frame.hard).toContain('quiet')
  })

  it('route.ts derives the frame from consultationUserTexts — the wiring, not just the helper', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/deriveSituation\(consultationUserTexts\(framingMessages\)/)
  })
})

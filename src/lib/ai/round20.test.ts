// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { composeFinal, isVerifyTurn } from './agent/runtime/answerFirst'

// Snow Crash, turn 2, live 2026-10-11 on 3018 (audit trace, verbatim): TWO model calls each answered — the answer-first check wrote
// "À, bạn đang nói tới Snow Crash…" and the final step wrote "Đúng tên là Snow Crash…". composeFinal joined them as two paragraphs.
const PREFACE_FULL = 'À, bạn đang nói tới **Snow Crash** của Neal Stephenson — tiểu thuyết khoa học viễn tưởng về một tương lai gần, nơi con người sống trong thế giới ảo gọi là Metaverse. Cuốn này có liên hệ với Mark Zuckerberg vì ông từng nhắc **Snow Crash** như nguồn cảm hứng cho ý tưởng Metaverse. Còn mình chưa thấy bằng chứng đáng tin xác nhận Bill Gates và vài người khác cùng thích hoặc cùng đọc cuốn này; có thể bạn đang ghép hai câu chuyện khác nhau.'
const PREFACE_ONE = 'À, bạn đang nói tới **Snow Crash** của Neal Stephenson — tiểu thuyết khoa học viễn tưởng về một tương lai gần, nơi con người sống trong thế giới ảo gọi là Metaverse.'
const FINAL = 'Đúng tên là **Snow Crash** của Neal Stephenson. Nhưng mình cần đính chính: cuốn này được nhắc đến như tác phẩm khai sinh khái niệm “Metaverse”, chứ mình chưa có nguồn đáng tin xác nhận Mark Zuckerberg và Bill Gates cùng thích hoặc cùng đọc nó. Có thể bạn đang nhớ lẫn với **Seveneves** — Bill Gates từng giới thiệu tiểu thuyết khoa học viễn tưởng này của chính Neal Stephenson, nhưng điều đó không xác nhận Mark cũng đọc cuốn ấy.'

const paragraphs = (s: string) => s.split(/\n{2,}/).filter(Boolean)

describe('verify / exact-number turns skip the answer-first guess', () => {
  it.each([
    'nghe nói Mark của meta và billgate thêm 1 vài người nữa cùng sở thích đọc 1 cuốn tiểu thuyết đúng ko',
    'vậy tesla có bao nhiêu sáng kiến và hiện đã ứng dụng được bao nhiêu cái rồi',
    'có thật không vậy',
  ])('yes: %s', t => expect(isVerifyTurn(t)).toBe(true))
  it.each([
    'cuối tuần sau tui muốn đi du lịch có gợi ý gì ko',
    'lên kế hoạch đi Nha Trang đi đôi, ăn chay, 3 ngày 2 đêm cuối tuần sau',
    'cuốn tiểu thuyết nói về tưởng tượng của tương lai, hình như tên snow gì đó',
  ])('no: %s', t => expect(isVerifyTurn(t)).toBe(false))
})

describe('Snow Crash: one answer, not two', () => {
  it('flag off (control): the two answers are joined as two paragraphs', () => {
    expect(paragraphs(composeFinal([PREFACE_ONE], FINAL))).toHaveLength(2)
  })
  it('flag on, preface = the opening sentence only: the restating final sentence goes and the answer reads as ONE paragraph', () => {
    const out = composeFinal([PREFACE_ONE], FINAL, { dedupeParaphrase: true })
    expect(paragraphs(out)).toHaveLength(1)
    expect(out.startsWith('À, bạn đang nói tới')).toBe(true)
    expect(out.match(/Snow Crash/g)).toHaveLength(1)
    expect(out).toContain('Nhưng mình cần đính chính')
    expect(out).not.toContain('Đúng tên là')
  })
  it('flag on, the full preface (it also says "no evidence found"): only the researched answer remains, once', () => {
    const out = composeFinal([PREFACE_FULL], FINAL, { dedupeParaphrase: true })
    expect(paragraphs(out)).toHaveLength(1)
    expect(out.match(/chưa (?:thấy|có nguồn)/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })
  it('a final sentence that adds something is never dropped as an "echo"', () => {
    const out = composeFinal(['Snow Crash là tiểu thuyết của Neal Stephenson, xuất bản năm 1992 và đặt ra từ metaverse.'], 'Neal Stephenson cũng viết Seveneves và Anathem, hai cuốn khác hẳn về đề tài.', { dedupeParaphrase: true })
    expect(out).toContain('Seveneves')
    expect(out).toContain('Snow Crash là tiểu thuyết')
  })
  it('stage trace reports every step', () => {
    const seen: string[] = []
    composeFinal([PREFACE_ONE], FINAL, { dedupeParaphrase: true, trace: s => seen.push(s) })
    expect(seen).toEqual(['after_paraphrase_dedupe', 'after_without_questions', 'keep', 'body'])
  })
})

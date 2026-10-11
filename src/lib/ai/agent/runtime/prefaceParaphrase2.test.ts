// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { composeFinal, withoutParaphrasedPrefaceParagraphs, prefaceNote } from './answerFirst'

// The passport turn, second live run on 3018 (2026-10-11, verbatim from the tool result in the UAT session): the pre-lookup advice (model
// knowledge, one model call) and the researched answer (second model call) are joined by composeFinal; no guard writes either part.
const PREFACE = [
  'Tờ khai đề nghị cấp hộ chiếu theo mẫu.\nCăn cước công dân còn giá trị; nếu chưa có căn cước thì dùng giấy tờ tùy thân hợp lệ theo hướng dẫn của cơ quan tiếp nhận.\nẢnh chân dung đúng quy cách; nếu nộp trực tiếp, thường có thể được chụp tại nơi tiếp nhận.',
  'Nộp ở đâu: Bạn có thể nộp trực tuyến qua Cổng dịch vụ công, hoặc nộp trực tiếp tại cơ quan quản lý xuất nhập cảnh Công an cấp tỉnh nơi bạn cư trú. Nếu nộp trực tuyến, cần tài khoản định danh phù hợp và ảnh hồ sơ đạt yêu cầu.',
  'Quy định và cách tiếp nhận có thể thay đổi; mình chưa xác minh được thông tin chính thức trong lượt này. Trước khi nộp, kiểm tra hướng dẫn mới nhất trên Cổng dịch vụ công hoặc hỏi cơ quan xuất nhập cảnh nơi bạn cư trú.',
].join('\n\n')
const FINAL = [
  'Theo Cổng Dịch vụ công Quốc gia, người lớn làm hộ chiếu lần đầu cần tờ khai đề nghị cấp hộ chiếu phổ thông mẫu TK01.',
  'Nộp tại Cơ quan Quản lý xuất nhập cảnh Công an cấp tỉnh; khi nộp trực tiếp cần xuất trình CCCD/CMND hoặc hộ chiếu còn giá trị. Trang chính thức mình kiểm tra chưa xác nhận rõ lựa chọn nộp trực tuyến và thời hạn xử lý, nên mốc 8 ngày làm việc trong phần tư vấn trước chưa được xác minh ở đây (vpcp.dichvucong.gov.vn).',
  'Vì vậy, trước khi đi, bạn nên xem mục “Cấp hộ chiếu phổ thông ở trong nước” trên Cổng Dịch vụ công Quốc gia hoặc hỏi cơ quan xuất nhập cảnh nơi định nộp để chốt hồ sơ và thời gian hiện hành.',
].join('\n\n')

describe('passport, second live run: what the join does today', () => {
  it('flag off: all three preface paragraphs and all three final paragraphs are shown', () => {
    const out = composeFinal([PREFACE], FINAL)
    expect(out.split(/\n{2,}/)).toHaveLength(6)
  })
  it('MEASURED LIMIT: word overlap between these paragraphs is below both thresholds, so the deterministic dedupe keeps them (no safe rule drops them)', () => {
    const kept = withoutParaphrasedPrefaceParagraphs([PREFACE], FINAL)
    expect(kept.join('\n\n')).toBe(PREFACE)
  })
  it('the instruction to the model: flag on adds "do not repeat documents / place / caveat"; flag off is byte-identical to before', () => {
    const off = prefaceNote('vi', [PREFACE])
    expect(prefaceNote('vi', [PREFACE], false)).toBe(off)
    const on = prefaceNote('vi', [PREFACE], true)
    expect(on.startsWith(off)).toBe(true)
    expect(on).toContain('Đừng nhắc lại hồ sơ, nơi nộp')
    expect(prefaceNote('en', [PREFACE], true)).toContain('Do not repeat the documents')
  })
})

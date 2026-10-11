// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { composeFinal, withoutParaphrasedPrefaceParagraphs } from './answerFirst'

// The passport turn of 2026-10-11 (verbatim, from the UAT stream trace): the pre-lookup advice and the researched answer say the same twice.
const PREFACE = [
  '**Hồ sơ lần đầu** thường gồm tờ khai đề nghị cấp hộ chiếu phổ thông (mẫu X01) và **CCCD còn giá trị** để đối chiếu; nếu làm trực tiếp, mang CCCD bản gốc. Ảnh chân dung 4×6 cm nền trắng thường được chụp tại nơi tiếp nhận. Nếu thông tin nhân thân trên hệ thống chưa đầy đủ hoặc có thay đổi, có thể cần giấy tờ bổ sung để xác minh.\n\n**Nộp hồ sơ:** trực tiếp tại Phòng Quản lý xuất nhập cảnh Công an cấp tỉnh nơi bạn cư trú hoặc qua Cổng dịch vụ công Bộ Công an nếu đủ điều kiện nộp trực tuyến. Trường hợp cấp lần đầu, nộp tại cấp tỉnh là cách phù hợp; một số trường hợp đặc biệt mới được nộp ở cấp trung ương.\n\n**Thời hạn giải quyết theo quy định:** không quá **8 ngày làm việc** kể từ khi nhận đủ hồ sơ hợp lệ. Thời gian bưu điện chuyển hộ chiếu về nhà (nếu đăng ký nhận qua bưu điện) có thể cộng thêm. Mình chưa xác minh được nguồn chính thức trong lượt này, nên bạn nên kiểm tra lại thời hạn và giấy tờ trên Cổng dịch vụ công Bộ Công an trước khi nộp.',
]
const FINAL = 'Theo Cổng Dịch vụ công Quốc gia, lần đầu bạn nộp tại **Cơ quan Quản lý xuất nhập cảnh Công an cấp tỉnh** nơi thường trú hoặc tạm trú; nếu có CCCD, có thể nộp tại cơ quan cấp tỉnh nơi thuận tiện. Có thể nộp trực tiếp hoặc trực tuyến qua cổng dịch vụ công. [S1]\n\nKhi nộp trực tiếp, mang **CCCD/Thẻ căn cước** để xuất trình. Ảnh hồ sơ là ảnh mới chụp trong 6 tháng, cỡ 4×6 cm, nhìn thẳng, đầu để trần, rõ mặt và hai tai, không đeo kính; nền trắng. [S1] Danh sách thành phần hồ sơ chi tiết trên trang chính thức chưa hiển thị đầy đủ ở dữ liệu mình xác minh được, nên bạn nên kiểm tra mục thủ tục trên cổng trước khi đi.\n\n**Thời gian:** thông tin 8 ngày làm việc mình nêu trước đó chưa được xác minh rõ từ nội dung trang chính thức đã đọc; hãy xem thời hạn trên giấy hẹn hoặc cổng dịch vụ công khi nộp.'

describe('a preface paragraph the researched answer restates is dropped (flag on)', () => {
  it('the live passport case: the "Nộp hồ sơ" paragraph (61 % of its words in a sourced final paragraph) goes; the rest stays', () => {
    const out = composeFinal(PREFACE, FINAL, { dedupeParaphrase: true })
    expect(out).toContain('Hồ sơ lần đầu') // not echoed by any sourced / unverified final paragraph
    expect(out).not.toContain('**Nộp hồ sơ:**')
    // KNOWN LIMIT (reported, not hidden): the "Thời hạn" paragraph overlaps its twin only 42 % — an unrelated paragraph reaches 30 %, so no
    // threshold separates them safely; it stays.
    expect(out).toContain('**Thời hạn giải quyết theo quy định:**')
    expect(out).toContain('Theo Cổng Dịch vụ công Quốc gia') // the researched paragraphs are all kept
    expect(out).toContain('**Thời gian:**')
  })
  it('CONTROL — flag off: unchanged (preface and final shown as before)', () => {
    const out = composeFinal(PREFACE, FINAL)
    expect(out).toContain('**Nộp hồ sơ:**')
    expect(out).toContain('**Thời hạn giải quyết theo quy định:**')
  })
  it('never drops preface text because of an unsourced final paragraph, a short one, or an unrelated one', () => {
    const unsourced = 'Nộp trực tiếp tại cơ quan quản lý xuất nhập cảnh công an cấp tỉnh nơi bạn cư trú hoặc qua cổng dịch vụ công bộ công an nếu đủ điều kiện nộp trực tuyến.'
    expect(withoutParaphrasedPrefaceParagraphs(PREFACE, unsourced)).toEqual(PREFACE) // no [S#] / no "chưa xác minh"
    expect(withoutParaphrasedPrefaceParagraphs(PREFACE, 'Xong rồi [S1].')).toEqual(PREFACE) // too short
    expect(withoutParaphrasedPrefaceParagraphs(PREFACE, 'Giá vé máy bay đi Đà Nẵng dịp lễ thường tăng mạnh so với ngày thường, nên đặt sớm vài tuần để có giá tốt hơn [S1].')).toEqual(PREFACE)
  })
})

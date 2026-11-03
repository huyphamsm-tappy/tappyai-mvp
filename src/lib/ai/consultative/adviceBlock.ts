// ── THE ADVICE LAYER (owner 02/10, A5 — "AI Consultative đâu") ───────────────────────────────────────────────────
//
// Until now an advisory turn was a LIST: pick + two alternatives + "Còn N lựa chọn nữa". The owner wants every
// domain to answer ASK → CONFIRM → DECIDE → ADVICE: a clear pick with a reason tied to what the user said, 2–4
// practical tips, what is missing and where to get it, and one sensible next step — inside the existing frame
// (short text + card strip, same data contract, STYLE_LUNA6 voice untouched).
//
// What the model may add is GENERAL advice (timing, how to choose, what to bring, what to compare). What it may NOT add
// is a FACT about a place or a fare (price, hours, address, promotion, flight time, availability): those stay with the
// tool data and the existing guards ("chưa có thông tin" + the link button when there is no source). The block is
// plain prompt text: it changes no data, schema, card, button, link, limit or guard. Default ON; CONSULT_ADVICE=0 off
// (byte-identical prompt). One block per (domain, turn) so the cached prefix stays stable.

import type { ConsultDomain, ConsultTurn } from './consultBrain'

export function adviceEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CONSULT_ADVICE ?? '').trim().toLowerCase()
  return !(v === '0' || v === 'off' || v === 'false')
}

/**
 * AI-Hay pass (04/10): the mandatory "Mẹo + Bước tiếp" boilerplate belongs where a user acts on it — trips and fares. On a food / spa / entertainment / shopping pick it is
 * filler (the trace of "trưa nay có món gì ngon" read like a call-centre script). The voice layer being OFF (STYLE_LUNA6=0) restores the old everywhere-advice.
 */
export function adviceApplies(domain: string | undefined, flight = false, env: Record<string, string | undefined> = process.env): boolean {
  if (env.STYLE_LUNA6 === '0') return true
  return domain === 'travel' && !flight // trips only; a fare pick gets its link and one honest line, not a tips script
}

const RULES = `- Lời khuyên CHUNG (khi nào nên đi, cách chọn, nên mang gì, nên so sánh gì, cẩn thận gì) viết từ hiểu biết chung của bạn, bám đúng điều người dùng đã nói (ngân sách, số người, ngày, khẩu vị); ghi "theo kinh nghiệm chung" MỘT lần cho cả phần mẹo.
- SỰ THẬT về một nơi/một chuyến (giá, giờ mở cửa, địa chỉ, khuyến mãi, giờ bay, còn chỗ/còn vé, khoảng cách, thời gian di chuyển) CHỈ khi có trong dữ liệu công cụ. Không có thì viết "chưa có thông tin" + nơi xem (nút/link hệ thống gắn). Mẹo KHÔNG chứa con số giá/giờ/khoảng cách của một nơi cụ thể.
- Không viết URL, không tên quán/khách sạn/sản phẩm ngoài dữ liệu công cụ.`

const TIPS: Record<string, string> = {
  travel: 'mùa/thời tiết hợp với điểm đến, giờ đi nên tránh nắng/đông, đồ nên mang, di chuyển tại chỗ, cảnh báo hay gặp (đặt sớm dịp cao điểm, giá hét ở điểm du lịch)',
  flight: 'đặt sớm (nhất là cuối tuần/lễ), so sánh hãng và hạng vé ở ít nhất 2 trang, hành lý ký gửi (mua trước thường rẻ hơn tại sân bay), chọn giờ bay (sớm/khuya thường ít đông, cuối tuần và chiều tối thường đông), có mặt sớm làm thủ tục',
  shopping: 'so giá ít nhất 2–3 nơi, chọn đúng dòng máy/đời/kích thước, xem bảo hành và đổi trả, mua ở shop có đánh giá, cẩn thận hàng nhái/giá rẻ bất thường',
  food: 'giờ nên đến để đỡ đông, món nên gọi theo loại quán và số người, có nên đặt bàn, chuyện gửi xe/đi lại, cách tránh hố',
  spa: 'đặt lịch trước, giờ vắng, nên chọn gói/dịch vụ nào theo nhu cầu, chuẩn bị trước khi đến (đừng ăn quá no, mang đồ thay), lưu ý sức khỏe',
  entertainment: 'giờ vàng và giờ đông, nên đặt phòng/vé trước không, nhóm bao nhiêu người thì hợp, mang giấy tờ nếu cần, chia tiền/gọi gì cho đỡ tốn',
}

function tipsKey(domain: ConsultDomain | string | undefined, flight: boolean): string {
  if (flight) return 'flight'
  return domain && domain in TIPS ? domain : 'food'
}

/** The advice block of one consult turn; '' when advice does not apply (ask / chat / no area). */
export function adviceBlock(o: { turn: ConsultTurn | undefined; domain: ConsultDomain | string | undefined; flight?: boolean; days?: number | null }): string {
  if (!o.turn || !o.domain || o.turn === 'ask' || o.turn === 'chat') return ''
  if (o.turn === 'plan') return o.domain === 'travel' && !o.flight ? TRIP_PLAN_ADVICE : ''
  const tips = TIPS[tipsKey(o.domain, !!o.flight)]
  const trip = o.domain === 'travel' && !o.flight
    ? `\n- ${o.days && o.days >= 2 && o.days <= 10 ? `Người dùng đã nói ${o.days} ngày: BẮT BUỘC thêm LỊCH NGẮN đúng ${o.days} dòng (Ngày 1 … Ngày ${o.days})` : 'Nếu người dùng đã nói số ngày: thêm LỊCH NGẮN theo ngày'}, mỗi ngày MỘT dòng "Ngày N: sáng … · chiều … · tối …" bằng hiểu biết chung về điểm đến (hoạt động/khu vực/món; KHÔNG tên quán hay giá nếu dữ liệu không có). Lý do chọn điểm đến phải bám sở thích đã nói (núi/biển, số ngày, xuất phát, số người).`
    : ''
  const flight = o.flight ? '\n- Vé máy bay: KHÔNG viết giá vé, giờ bay, "bay thẳng", hãng nào rẻ nhất — chưa có dữ liệu thì nói "chưa có giá/giờ bay" và chỉ nút xem giá (Traveloka/Trip.com) bên dưới.' : ''
  if (o.turn === 'followup' || o.turn === 'compare') {
    return `\n\n===== LỜI KHUYÊN (lớp tư vấn) =====\nSau khi trả lời đúng câu hỏi bằng dữ liệu đã có, thêm 1–2 mẹo thực tế hợp ngữ cảnh (${tips}) và MỘT bước tiếp theo hợp lý (đặt, kiểm tra, hay so sánh gì tiếp).\n${RULES}${flight}\n=====`
  }
  return `\n\n===== LỜI KHUYÊN — BẮT BUỘC có đủ 4 phần (thiếu phần MẸO hoặc BƯỚC TIẾP là LỖI) =====
Khối này GHI ĐÈ "ngắn gọn vài câu" của khung ở trên: cho phép tới ~12 dòng ngắn. Giữ nguyên cách chốt (một lựa chọn chính + tối đa 2 phương án, mỗi cái một dòng) và mọi luật sự thật. Mẫu (thay <…> bằng nội dung thật của lượt này):
**Mình chọn: <TÊN>** — <LÝ DO gắn với điều người dùng đã nói: "vì bạn đi … người, tầm …, thích …">.
(phương án khác nếu có, mỗi cái một dòng)
Mẹo (theo kinh nghiệm chung):
- <mẹo 1 hợp ngữ cảnh>
- <mẹo 2>
- <mẹo 3, nếu có>
<Một câu: còn thiếu gì (giá/giờ/còn chỗ) và xem ở đâu — nút/link bên dưới, hoặc gọi nơi đó.>
<Một câu BƯỚC TIẾP: nên làm gì ngay (đặt trước, so sánh thêm, hoặc bấm "Lên kế hoạch chi tiết").>
Gợi ý chủ đề mẹo cho lượt này: ${tips}.
${RULES}${trip}${flight}
=====`
}

/** The trip plan turn: what each text section holds so the user receives a PLAN, not "chưa có thông tin". */
export const TRIP_PLAN_ADVICE = `

===== KẾ HOẠCH CHUYẾN ĐI = TƯ VẤN ĐẦY ĐỦ (GHI ĐÈ các câu "chưa có thông tin" ở trên cho phần LỜI KHUYÊN CHUNG; không ghi đè luật sự thật) =====
Người dùng xin KẾ HOẠCH, không phải danh sách khách sạn. Viết như người tư vấn du lịch bản địa, bám đúng điều họ nói (điểm đến, số ngày, ngày đi, xuất phát, số người, ngân sách, sở thích). KHÔNG mở bằng nhiều câu "mình chưa xác nhận được …": MỘT câu duy nhất ở cuối nói những gì chưa có nguồn (giá phòng, giờ bay, giá vé tham quan).
Khối [TAPPY_PLAN] — BẮT BUỘC mỗi ngày có ĐÚNG 3 mục theo giờ tăng dần: SÁNG (~09:00) · CHIỀU (~14:00) · TỐI (~19:00) (Ngày 1: nhận phòng khách sạn ~14:00 thay cho buổi chiều; ngày cuối: buổi chiều về). Mục có địa điểm THẬT lấy từ kết quả công cụ thì dùng tên đúng; buổi nào không có địa điểm thật phù hợp thì viết mục category "free" (không tên quán/hãng), name là hoạt động chung hợp điểm đến, vd {"time":"09:00","emoji":"🌊","category":"free","name":"Dạo biển, ăn sáng nhẹ","description":"Theo kinh nghiệm chung, đi sớm cho mát và vắng.","price":"","address":"","maps_link":"","booking_link":"","place_id":""}. KHÔNG xếp khách sạn vào bữa ăn, KHÔNG lặp một quán cho 2 bữa liền. Khách sạn: MỘT nơi ở chọn từ kết quả (cả chuyến), kèm lý do trong "description". "local_tips": 3–4 mẹo basis "general" (thời điểm, trang phục, di chuyển, cảnh báo), KHÔNG con số.
Phần chữ sau khối, đúng các tiêu đề của khung, mỗi mục viết thật chứ không để trống:
- **Tóm tắt chuyến**: 2–3 câu: nhịp chuyến đi (đi gì, mỗi ngày làm gì chính), NƠI Ở đã chọn + lý do 1 câu (khu vực, tiện đi lại), cách đi lại tại điểm đến (grab/taxi/thuê xe máy/đi bộ — nói chung, không giá, không số phút).
- **Ăn ở đâu, gọi món gì**: 3–5 MÓN/kiểu ăn nên thử ở điểm đến (hiểu biết chung, vd đặc sản vùng) + KHU VỰC ăn uống nói chung; tên quán CHỈ khi có trong dữ liệu công cụ. Không giá món.
- **Mẹo & cạm bẫy**: 3–4 gạch đầu dòng, mỗi gạch một mẹo bản địa (giờ nên đi để tránh nắng/đông, đồ nên mang, cảnh báo giá/đặt sớm dịp cao điểm, nên/không nên). Ghi "theo kinh nghiệm chung" một lần.
- **Khi trời mưa**: 2–3 phương án trong nhà/đổi lịch (nói chung).
- **Ngân sách**: KHÔNG viết mục này và KHÔNG viết số tiền không có nguồn — hệ thống tự thêm "Ước tính ngân sách" theo hạng mục (lưu trú, ăn uống, đi lại, vé tham quan) gắn nhãn "ước tính tham khảo". Khoản có giá THẬT trong dữ liệu thì nhắc kèm nguồn ở mục khác.
- **Việc cần làm trước khi đi**: 3–4 bước cụ thể (đặt vé/phòng sớm — dịp cao điểm, kiểm tra thời tiết sát ngày, giấy tờ/đồ cần mang, xem giá thật ở nút bên dưới) và mời chỉnh (ngân sách, khách sạn, số ngày).
${RULES}
=====`

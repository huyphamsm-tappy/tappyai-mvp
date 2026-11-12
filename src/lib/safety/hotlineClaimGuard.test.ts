// Hotline claim guard (12/11/2026): hours and cost of 113, 114 and 115 are NOT established by the owner's verified list (only 111 and 112 are), so a final answer may not state them.
// Cases are [input, expected]; expected === input means "must not change" (near-misses and verified numbers).
import { describe, it, expect } from 'vitest'
import { guardHotlineClaims, splitSentences, UNVERIFIED_HOTLINE_NUMBERS } from './hotlineClaimGuard'
import { VERIFIED_HOTLINES } from './emergencyPayload'

const UAT = 'Cuộc gọi đến tổng đài 115 miễn phí; tuy nhiên, chi phí xe cứu thương có thể được tính riêng'

type Case = [string, string]
const same = (s: string): Case => [s, s]

const VI: Case[] = [
  // the exact UAT sentence, alone, with a full stop, and inside a paragraph
  [UAT, ''],
  [UAT + '.', ''],
  ['Gọi 115 khi cần cấp cứu. ' + UAT + '. Bạn nên báo rõ địa chỉ.', 'Gọi 115 khi cần cấp cứu. Bạn nên báo rõ địa chỉ.'],
  ['Hãy gọi 115. Cuộc gọi đến tổng đài 115 miễn phí; tuy nhiên, chi phí xe cứu thương có thể được tính riêng.\nBạn nên giữ bình tĩnh.', 'Hãy gọi 115.\nBạn nên giữ bình tĩnh.'],
  // cost claims
  ['Tổng đài 115 miễn phí.', ''],
  ['Gọi 115 là miễn phí.', ''],
  ['Số 114 không mất tiền khi gọi.', ''],
  ['Gọi 113 không tốn phí.', ''],
  ['Gọi 113 không tính phí cuộc gọi.', ''],
  ['Gọi 115 hoàn toàn miễn cước.', ''],
  ['Đường dây 115 (miễn phí) tiếp nhận cuộc gọi cấp cứu.', ''],
  ['**115** miễn phí cho mọi cuộc gọi.', ''],
  // hours claims
  ['Tổng đài 115 hoạt động 24/7.', ''],
  ['Số 113 trực 24/24.', ''],
  ['Đường dây 114 phục vụ 24 giờ mỗi ngày.', ''],
  ['Số 114 trực 24h.', ''],
  ['Gọi 115 bất cứ lúc nào, suốt ngày đêm.', ''],
  ['Tổng đài 113 làm việc cả ngày lẫn đêm.', ''],
  // both claims, several numbers
  ['Các số 113, 114 và 115 đều miễn phí và hoạt động 24/7.', ''],
  ['113/114/115 miễn phí.', ''],
  // mixed with a verified number: cannot be attributed, so it is not published for the unverified one
  ['111 và 115 đều miễn phí.', ''],
  ['Gọi 112 hoặc 114, miễn phí 24/7.', ''],
  // only the claim clause goes, the rest of the sentence stays
  ['Gọi 111 miễn phí; gọi 115 miễn phí.', 'Gọi 111 miễn phí.'],
  ['Gọi 115 miễn phí; mang theo giấy tờ tùy thân.', 'Mang theo giấy tờ tùy thân.'],
  ['Gọi 115 miễn phí, nhưng hãy chuẩn bị địa chỉ.', ''],
  // bullets and lines
  ['- Gọi 115: miễn phí\n- Gọi 113 khi có trộm', '- Gọi 113 khi có trộm'],
  ['Danh sách:\n* 114 - cứu hỏa, 24/7\n* 115 - cấp cứu\n', 'Danh sách:\n* 115 - cấp cứu\n'],
  // other sentences around stay byte for byte
  ['Bạn đang ở đâu? Tổng đài 115 miễn phí. Mình ở đây để giúp.', 'Bạn đang ở đâu? Mình ở đây để giúp.'],
  ['Số 115 là số cấp cứu y tế. Gọi 115 miễn phí! Hãy nói rõ địa chỉ.', 'Số 115 là số cấp cứu y tế. Hãy nói rõ địa chỉ.'],
  // unaccented spelling
  ['Goi 115 mien phi.', ''],
  // near misses that must NOT change
  same('Số điện thoại 0115 123 456 miễn phí.'),
  same('Phí giao hàng 115,000 đồng, miễn phí đổi trả.'),
  same('Giá 115.000đ, miễn phí vận chuyển.'),
  same('Gọi 1900 115 để được tư vấn miễn phí.'),
  same('Hotline +84 115 678 miễn phí 24/7.'),
  same('Chúng tôi có 114 cửa hàng, giao hàng miễn phí.'),
  same('Có 113 người đăng ký tham gia miễn phí.'),
  same('Phòng 115 có wifi miễn phí.'),
  same('Số 115 là số điện thoại cấp cứu y tế.'),
  same('Số 113 là số của công an.'),
  same('Gọi 114 khi có cháy. Gọi 113 khi có trộm.'),
  same('Gọi 115 để cấp cứu, còn 111 miễn phí 24/7.'),
  same('Tổng đài 111 miễn phí, hoạt động 24/7.'),
  same('Số 112 hoạt động 24/7 và miễn phí.'),
  same('Gọi 111 hoặc 112 miễn phí.'),
  same('Trường hợp khẩn cấp hãy gọi 115 hoặc đến bệnh viện gần nhất.'),
  same('Ghé quán miễn phí trà đá vào lúc 24 giờ.'),
  same('Gói dịch vụ 11 5 miễn phí.'),
  same(''),
  same('Không có hotline nào được nhắc ở đây, miễn phí 24/7.'),
]

const EN: Case[] = [
  ['Hotline 115 is free to call.', ''],
  ['Calls to 115 are free.', ''],
  ['The 115 ambulance line is toll-free.', ''],
  ['The 114 number is toll free and open 24 hours a day.', ''],
  ['Call 113 at no cost.', ''],
  ['You can call 114 without charge.', ''],
  ['There is no charge for calling 115.', ''],
  ['113 is the police line and operates 24/7.', ''],
  ['Dial 115 any time, it runs 24 hours.', ''],
  ['The 114 fire line works around the clock.', ''],
  ['The 113 line is open day and night.', ''],
  ['The 115 line answers 24/24.', ''],
  ['Call 115 for an ambulance. It is free of charge.', 'Call 115 for an ambulance. It is free of charge.'],
  ['The numbers 113, 114 and 115 are all free and open 24/7.', ''],
  ['111 and 115 are both free.', ''],
  ['Dial 111 for free; dial 115 for free.', 'Dial 111 for free.'],
  ['Dial 115; it is free, but ambulance fees may apply.', 'Dial 115.'],
  ['Call 115 for an ambulance. The call is free. Stay calm.', 'Call 115 for an ambulance. The call is free. Stay calm.'],
  ['Call 115 for an ambulance. 115 is free to call. Stay calm.', 'Call 115 for an ambulance. Stay calm.'],
  ['Hotlines:\n- 115 (free, 24/7)\n- 113 (police)', 'Hotlines:\n- 113 (police)'],
  ['**115** is free.\n\nCall it when someone is hurt.', 'Call it when someone is hurt.'],
  ['See TP. HCM listings: 115 is free.', ''],
  ['Call 115 for an ambulance. However, it is free; the ambulance is not.', 'Call 115 for an ambulance. However, it is free; the ambulance is not.'],
  ['Call 114 for a fire. It is toll-free. However, rescue fees may apply.', 'Call 114 for a fire. It is toll-free. However, rescue fees may apply.'],
  ['Call 115 for an ambulance. 115 is free. However, ambulance fees may apply.', 'Call 115 for an ambulance. Ambulance fees may apply.'],
  // near misses that must NOT change
  same('Feel free to call 115 whenever someone is hurt.'),
  same('Feel free to ask about 114 or 113.'),
  same('Call 115 for an ambulance.'),
  same('The 115 line is the national medical emergency number.'),
  same('The package costs $115 and shipping is free.'),
  same('It costs 115,000 VND, free delivery included.'),
  same('The ticket is 115.50 USD and free cancellation applies.'),
  same('Call 1900 115 for free advice.'),
  same('Phone +84 113 456 is free to try.'),
  same('Room 114 has free wifi.'),
  same('We have 113 stores with free parking.'),
  same('The 115km route is free to walk.'),
  same('Our hands-free 114 model is on sale.'),
  same('Call 111 any time; it is free.'),
  same('112 is free and open 24/7.'),
  same('Dial 111 or 112 for free, 24 hours a day.'),
  same('Dial 115 to reach an ambulance, while 111 is free 24/7.'),
  same('No hotline here, but it is free and open 24/7.'),
  same('The 2024 report lists 115 clinics open 24 hours.'),
  same(''),
]

const ZH: Case[] = [
  ['拨打115免费。', ''],
  ['115急救电话是免费的。', ''],
  ['114火警电话全天24小时服务。', ''],
  ['113报警电话24小时接听。', ''],
  ['115可以免費撥打。', ''],
  ['113、114和115都是免费电话。', ''],
  ['拨打114不收费，全天开放。', ''],
  ['115全天候提供救护车服务。', ''],
  ['115电话不间断受理。', ''],
  ['111和115都免费。', ''],
  ['拨打111免费；拨打115免费。', '拨打111免费。'],
  ['遇到紧急情况请拨打115。拨打115免费。请保持冷静。', '遇到紧急情况请拨打115。请保持冷静。'],
  ['急救电话：\n- 115（免费，24小时）\n- 113（报警）', '急救电话：\n- 113（报警）'],
  ['拨打115免费！但是救护车费用可能另计。', '救护车费用可能另计。'],
  ['拨打115免费24/7。', ''],
  ['二十四小时都可以打114。', ''],
  ['114二十四小时服务。', ''],
  ['113全天候。', ''],
  ['您可以免费拨打 115 求助。', ''],
  ['115 24小时。', ''],
  // near misses that must NOT change
  same('拨打115求助。'),
  same('115是医疗急救电话。'),
  same('该商品售价115元，免费送货。'),
  same('电话0115123456免费咨询。'),
  same('我们有114家门店提供免费停车。'),
  same('这里有113个人免费参加。'),
  same('房间115免费提供早餐。'),
  same('拨打111免费，全天24小时。'),
  same('112全天候免费。'),
  same('拨打1900 115可免费咨询。'),
  ['拨打115求助，111免费。', ''], // one clause: the claim cannot be attributed, so it is not published (the verified 111 claim goes with it)
  same('免费咨询请拨打111。'),
  same('全天24小时营业的商店有很多。'),
  same(''),
  same('价格是1,115元，免费配送。'),
  same('版本1.115免费更新。'),
]

describe('hotlineClaimGuard: the registry decides', () => {
  it('only 111 and 112 are established, so 113, 114 and 115 are guarded', () => {
    expect([...UNVERIFIED_HOTLINE_NUMBERS].sort()).toEqual(['113', '114', '115'])
    for (const h of VERIFIED_HOTLINES) {
      const ok = !!h.operatingHours && h.freeOfCharge === true
      expect(UNVERIFIED_HOTLINE_NUMBERS.includes(h.phoneNumber ?? ''), h.hotlineId).toBe(!ok && ['113', '114', '115'].includes(h.phoneNumber ?? ''))
    }
  })
})

describe.each([['Vietnamese', VI], ['English', EN], ['Chinese', ZH]] as const)('hotlineClaimGuard: %s', (_n, cases) => {
  it('has at least 30 cases', () => { expect(cases.length).toBeGreaterThanOrEqual(30) })
  it.each(cases.map((c, i) => [i, c[0], c[1]] as const))('#%i %s', (_i, input, expected) => {
    const r = guardHotlineClaims(input)
    expect(r.text).toBe(expected)
    expect(r.changed).toBe(input !== expected)
    // idempotent: a second pass finds nothing more
    expect(guardHotlineClaims(r.text).text).toBe(r.text)
  })
})

describe('hotlineClaimGuard: rules', () => {
  it('splitSentences loses no character and keeps 115.000 and TP. HCM whole', () => {
    for (const t of ['A. B! C?\nD 115.000 đồng. E', 'Ở TP. HCM gọi 115. Xong.', '拨打115。免费！\n好', '**Bold.** Next', '']) expect(splitSentences(t).map(s => s.body + s.trail).join('')).toBe(t)
    expect(splitSentences('Giá 115.000 đồng. Tiếp').length).toBe(2)
    expect(splitSentences('Ở TP. HCM gọi 115. Xong.').length).toBe(2)
  })
  it('the capital letter of a sentence that lost its first clause is kept', () => {
    expect(guardHotlineClaims('Gọi 115 miễn phí; mang theo giấy tờ.').text).toBe('Mang theo giấy tờ.')
  })
  it('a text with no code is returned as the same string', () => {
    const t = 'Chào bạn, miễn phí 24/7 nhé.'
    expect(guardHotlineClaims(t).text).toBe(t)
  })
  it('a long answer loses only the offending sentence', () => {
    const a = 'Dưới đây là cách xử lý.\n\n1. Giữ bình tĩnh.\n2. Gọi 115 để điều xe cứu thương. Tổng đài 115 miễn phí.\n3. Nói rõ địa chỉ.\n\nChúc bạn bình an.'
    expect(guardHotlineClaims(a).text).toBe('Dưới đây là cách xử lý.\n\n1. Giữ bình tĩnh.\n2. Gọi 115 để điều xe cứu thương.\n3. Nói rõ địa chỉ.\n\nChúc bạn bình an.')
    expect(guardHotlineClaims(a).removedSentences).toBe(1)
  })
  it('never invents text: the output is made only of pieces of the input', () => {
    for (const [input] of [...VI, ...EN, ...ZH]) {
      const out = guardHotlineClaims(input).text
      const words = out.match(/[\p{L}\p{N}]+/gu) ?? []
      for (const w of words) expect(input.toLocaleLowerCase('vi').includes(w.toLocaleLowerCase('vi')), `${w} in ${input}`).toBe(true)
    }
  })
})

// 12/11/2026, second round of the lead's UAT: the model rephrased so the "the call is free" claim sits in a sentence WITHOUT the number (115 is in the sentence before).
// When an unverified number (113/114/115) is in the answer, a sentence that makes a CALL-specific cost or hours claim goes too; other free things (Wi-Fi, entry, a tour), costs of the ambulance,
// and 111/112 (verified) never. A contrast clause that stays grammatical without the claim is kept.
import { describe, it, expect } from 'vitest'
import { guardHotlineClaims } from './hotlineClaimGuard'
import { hotlineClaimGuardStream } from './hotlineClaimStream'

type Case = [string, string]
const same = (s: string): Case => [s, s]

const UAT_PAIR = 'Số 115 là số gì và gọi có mất tiền không? Số 115 là số cấp cứu y tế. Lưu ý: cước gọi miễn phí không đồng nghĩa với mọi chi phí xe cứu thương hay điều trị đều miễn phí; bạn nên hỏi bệnh viện.'

const VI: Case[] = [
  [UAT_PAIR, 'Số 115 là số gì và gọi có mất tiền không? Số 115 là số cấp cứu y tế. Bạn nên hỏi bệnh viện.'],
  ['Số 115 là số cấp cứu y tế. Cuộc gọi miễn phí.', 'Số 115 là số cấp cứu y tế.'],
  ['Gọi 115 khi cần. Gọi đến số này không mất tiền.', 'Gọi 115 khi cần.'],
  ['Gọi 115 khi cần. Gọi đến tổng đài không tốn phí. Hãy nói rõ địa chỉ.', 'Gọi 115 khi cần. Hãy nói rõ địa chỉ.'],
  ['Số 113 là công an. Tổng đài hoạt động 24/7.', 'Số 113 là công an.'],
  ['Số 114 là cứu hỏa. Đường dây trực 24 giờ mỗi ngày.', 'Số 114 là cứu hỏa.'],
  ['Số 114 là cứu hỏa. Hotline phục vụ 24/24.', 'Số 114 là cứu hỏa.'],
  ['Số 115 dùng để cấp cứu. Cuộc gọi không tốn phí, nhưng chi phí xe cứu thương có thể tính riêng.', 'Số 115 dùng để cấp cứu. Chi phí xe cứu thương có thể tính riêng.'],
  [ 'Cuộc gọi đến tổng đài 115 miễn phí; tuy nhiên, chi phí xe cứu thương có thể được tính riêng', 'Chi phí xe cứu thương có thể được tính riêng'],
  ['Số 115 là số cấp cứu. Miễn phí khi gọi điện thoại đến số này.', 'Số 115 là số cấp cứu.'],
  ['Số 115 là số cấp cứu.\nCước gọi miễn phí.\nHãy nói rõ địa chỉ.', 'Số 115 là số cấp cứu.\nHãy nói rõ địa chỉ.'],
  // near misses: other free things, costs of the ambulance, no number, only verified numbers
  same('Số 115 là số cấp cứu. Wifi miễn phí tại quán.'),
  same('Số 115 là số cấp cứu. Vé vào cổng miễn phí.'),
  same('Số 115 là số cấp cứu. Tour tham quan miễn phí cho trẻ em.'),
  same('Số 115 là số cấp cứu. Chi phí xe cứu thương có thể được tính riêng.'),
  same('Số 115 là số cấp cứu. Gọi món miễn phí nước chấm.'),
  same('Số 115 là số cấp cứu. Cửa hàng mở cửa 24/7.'),
  same('Gọi 111. Cuộc gọi miễn phí 24/7.'),
  same('Số 112 là thiên tai. Cuộc gọi miễn phí.'),
  same('Cuộc gọi miễn phí.'),
  same('Số 115 là cấp cứu. Còn 111 là bảo vệ trẻ em. Cuộc gọi đến 111 miễn phí.'),
  same('Số 115 là cấp cứu. Số 111 là bảo vệ trẻ em. Cuộc gọi miễn phí, hoạt động 24/7.'),
]

const EN: Case[] = [
  ['Dial 115 for an ambulance. The call is free.', 'Dial 115 for an ambulance.'],
  ['Dial 115 for an ambulance. Calls are free of charge.', 'Dial 115 for an ambulance.'],
  ['115 is the ambulance line. It is toll-free.', '115 is the ambulance line.'],
  ['Call 115. It is free to call.', 'Call 115.'],
  ['Call 113 for police. The line is open 24/7.', 'Call 113 for police.'],
  ['Call 114 for fire. The hotline is available 24 hours a day.', 'Call 114 for fire.'],
  ['Call 115. Free calls are available.', 'Call 115.'],
  ['Call 115 for an ambulance. The call is free. Stay calm.', 'Call 115 for an ambulance. Stay calm.'],
  ['Call 115 for an ambulance. The call is free, but ambulance or treatment costs may be charged separately.', 'Call 115 for an ambulance. Ambulance or treatment costs may be charged separately.'],
  ['Dial 115; it is free, but ambulance fees may apply.', 'Dial 115; ambulance fees may apply.'],
  ['Call 115 for an ambulance. Note: a free call does not mean every ambulance cost is free; ask the hospital.', 'Call 115 for an ambulance. Ask the hospital.'],
  same('Call 115 for an ambulance. The hotel has free Wi-Fi.'),
  same('Call 115. Free entry for kids.'),
  same('Call 115. Ambulance costs may be charged separately.'),
  same('Call 115. The free tour starts at 9.'),
  same('Call 115. The shop is open 24/7.'),
  same('Call 115. Feel free to ask me more.'),
  same('Call 111. The call is free.'),
  same('112 is for disasters. The line is open 24/7.'),
  same('The call is free.'),
  same('Call 115. Then call 111. The call is free and the line is open 24/7.'),
]

const ZH: Case[] = [
  ['拨打115求助。通话免费。', '拨打115求助。'],
  ['115是急救电话。拨打免费。', '115是急救电话。'],
  ['113是报警电话。这是免费电话。', '113是报警电话。'],
  ['114是火警电话。24小时接听。', '114是火警电话。'],
  ['115是急救电话。全天接听。', '115是急救电话。'],
  ['115是急救电话。可免费拨打。', '115是急救电话。'],
  ['拨打115通话免费，但是救护车费用可能另计。', '救护车费用可能另计。'],
  same('拨打115求助。酒店提供免费早餐。'),
  same('拨打115。门票免费。'),
  same('拨打115。免费WiFi。'),
  same('拨打115。救护车费用可能另计。'),
  same('拨打111。通话免费。'),
  same('通话免费。'),
]

describe.each([['Vietnamese', VI], ['English', EN], ['Chinese', ZH]] as const)('call-specific claim in a sentence without the number: %s', (_n, cases) => {
  it.each(cases.map((c, i) => [i, c[0], c[1]] as const))('#%i %s', (_i, input, expected) => {
    const r = guardHotlineClaims(input)
    expect(r.text).toBe(expected)
    expect(r.changed).toBe(input !== expected)
    expect(guardHotlineClaims(r.text).text).toBe(r.text) // idempotent
  })
})

describe('call-specific claim: counts and the stream', () => {
  it('has at least 30 new cases', () => { expect(VI.length + EN.length + ZH.length).toBeGreaterThanOrEqual(30) })
  const enc = new TextEncoder()
  const frame = (t: string) => '0:' + JSON.stringify(t) + '\n'
  const run = async (chunks: string[]) => {
    const rs = new ReadableStream<Uint8Array>({ start(c) { for (const k of chunks) c.enqueue(enc.encode(k)); c.close() } })
    const wire = await new Response(rs.pipeThrough(hotlineClaimGuardStream())).text()
    return wire.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }
  it('the number is released in an earlier sentence, the claim arrives later in pieces: still removed', async () => {
    const words = 'Số 115 là số cấp cứu y tế. Lưu ý: cước gọi miễn phí không đồng nghĩa với mọi chi phí xe cứu thương đều miễn phí; bạn nên hỏi bệnh viện. Chúc bạn khỏe.'.split(/(?<= )/)
    expect(await run(words.map(frame))).toBe('Số 115 là số cấp cứu y tế. Bạn nên hỏi bệnh viện. Chúc bạn khỏe.')
  })
  it('a non-text frame between the two sentences does not forget the number', async () => {
    expect(await run([frame('Gọi 115 khi cần. '), '9:{"x":1}\n', frame('Cuộc gọi miễn phí. Xong.'), 'd:{}\n'])).toBe('Gọi 115 khi cần. Xong.')
  })
  it('with only 111 in the earlier sentence the same claim is kept', async () => {
    expect(await run([frame('Gọi 111 khi cần. '), frame('Cuộc gọi miễn phí. Xong.')])).toBe('Gọi 111 khi cần. Cuộc gọi miễn phí. Xong.')
  })
  it('known limit: a claim already released BEFORE the number was seen cannot be taken back', async () => {
    expect(await run([frame('Cuộc gọi miễn phí. '), frame('Câu hai. '), frame('Câu ba. '), frame('Số 115 là cấp cứu. Xong.')])).toBe('Cuộc gọi miễn phí. Câu hai. Câu ba. Số 115 là cấp cứu. Xong.')
  })
})

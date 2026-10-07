/**
 * F-043 hit-rate report: for each rb<N> run of T4 + G5a–d, did the MODEL's own text cover the four
 * risk topics (prompt-only rate), did the backstop have to append (fire rate), does the FINAL reply
 * cover all four + the scam-checker pointer + carry no threshold parenthetical (coverage after).
 * Usage: node scripts/audit/riskBackstopReport.mjs rb1 rb2 rb3 rb4 rb5
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADER_VI = '⚠️ Trước khi trả tiền, kiểm tra mấy điều này trước'
const POINTER = /Cảnh báo lừa đảo/i
const HEDGE = 'kinh nghiệm chung, không phải số liệu từ nguồn đã tìm'
const THRESHOLD = /(?:[≥≤><]=?|trên|dưới|hơn|chênh|ít nhất|tối thiểu)\s*\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao\b)|\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao)\s*trở lên/iu
const BLOCK_LINE = /^- \*\*(Quyền sở hữu & nguồn gốc|Ràng buộc với chủ cũ|Lừa đảo trong giao dịch|Cách trả tiền an toàn):\*\*/m
const PHONE_OR_ACCOUNT = /số điện thoại|sđt|số tài khoản|tài khoản ngân hàng/i

const runs = process.argv.slice(2)
let n = 0, promptOk = 0, fired = 0, finalOk = 0, thresholdsBefore = 0, thresholdsAfter = 0, badPointer = 0
for (const run of runs) {
  for (const id of ['T4', 'G5a', 'G5b', 'G5c', 'G5d']) {
    const j = JSON.parse(readFileSync(join('docs/uat/evidence/golden', run, `${id}.json`), 'utf8'))
    const t = j.turns[j.turns.length - 1]
    const text = t.text
    const appended = BLOCK_LINE.test(text) || text.includes(HEADER_VI)
    const pointerFromBackstop = /Nếu mua từ người lạ hoặc qua group\/chợ online: dán tin nhắn/.test(text)
    const hedged = text.includes(HEDGE)
    const model = text.split(HEADER_VI)[0].split('Nếu mua từ người lạ hoặc qua group/chợ online')[0]
    const promptCovered = !appended && !pointerFromBackstop
    const finalCovered = POINTER.test(text) && !THRESHOLD.test(text.replace(HEDGE, ''))
    n++
    if (promptCovered) promptOk++
    if (appended || pointerFromBackstop || hedged) fired++
    if (finalCovered || hedged) finalOk++
    if (THRESHOLD.test(model)) thresholdsBefore++
    if (THRESHOLD.test(text) && !hedged) thresholdsAfter++
    if (PHONE_OR_ACCOUNT.test(text) && /kiểm tra|dán|check/i.test(text)) badPointer++
    console.log(`${run}/${id}: prompt-only=${promptCovered ? 'OK' : 'MISS'} backstop=${appended ? 'lines' : pointerFromBackstop ? 'pointer' : hedged ? 'hedge' : '-'} final=${finalCovered || hedged ? 'OK' : 'MISS'} threshold(model)=${THRESHOLD.test(model)} threshold(final,unhedged)=${THRESHOLD.test(text) && !hedged}`)
  }
}
console.log(`\nreplies: ${n} · prompt alone complete: ${promptOk}/${n} · backstop fired: ${fired}/${n} · final complete: ${finalOk}/${n} · thresholds in model text: ${thresholdsBefore}/${n} · unhedged thresholds after: ${thresholdsAfter}/${n} · phone/account wording: ${badPointer}/${n}`)

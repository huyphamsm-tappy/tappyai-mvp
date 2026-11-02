import { describe, it, expect, vi } from 'vitest'
import { allScenarios } from '../index'
import { matchScenario, coveredScenarioNumbers, STRONG_AT, WEAK_AT } from '../match'
import { analyzeMessage } from '../../message'
import { fakeAnalyzer, tableUrlChecker } from '../../message/__tests__/fixtures'

// ── Short-input recognition of the 25 official scenarios (owner 02/10) ──────
//
// "Bưu phẩm Trung thu kèm mã QR" — eight words, no request, no link — came out "An toàn". The
// fixtures below are SHORT descriptions written from the real scenario data in bocongan2026.ts
// (titles, summaries, warning signs); three have the shape of the owner's example.

const FIXTURES: Array<{ text: string; scenario: number; note: string }> = [
  { text: 'Cuộc gọi video người thân hình mờ, giật rồi tắt đột ngột, nói cần tiền gấp', scenario: 1, note: 'deepfake video' },
  { text: 'Giọng giống người quen nhưng gọi từ số lạ, nhờ chuyển tiền vay tạm', scenario: 2, note: 'DeepVoice' },
  { text: 'Gọi điện im lặng, đầu dây không nói chuyện, chỉ hỏi "A lô? Ai đấy?"', scenario: 9, note: 'silent call' },
  { text: 'Người lạ xưng công an báo liên quan vụ án rửa tiền, đòi chuyển vào tài khoản tạm giữ', scenario: 3, note: 'judicial' },
  { text: 'Nhân viên ngân hàng báo giao dịch lạ và yêu cầu đọc mã OTP', scenario: 4, note: 'bank staff' },
  { text: 'Tin nhắn Brandname giả báo đăng nhập bất thường kèm link', scenario: 5, note: 'brandname' },
  { text: 'Báo SIM sắp bị khóa trong vài giờ nếu không chuẩn hóa thuê bao', scenario: 12, note: 'SIM' },
  { text: 'Thông báo nợ cước điện, dọa cắt điện trong vài giờ nếu không nộp cước', scenario: 17, note: 'utilities' },
  { text: 'Phạt nguội kèm link tra cứu, thúc nộp phạt ngay', scenario: 22, note: 'phạt nguội' },
  { text: 'Việc nhẹ lương cao, làm nhiệm vụ đặt đơn ảo nhận hoa hồng', scenario: 14, note: 'collaborator' },
  { text: 'Nhóm đầu tư có thầy đọc lệnh VIP, rút được lãi nhỏ rồi bị chặn rút tiền', scenario: 16, note: 'investment group' },
  { text: 'Trúng thưởng chương trình bạn không tham gia, phải đóng phí vận chuyển', scenario: 23, note: 'prize' },
  // The owner's shape: <parcel/gift word> + "kèm mã QR".
  { text: 'Bưu phẩm Trung thu kèm mã QR', scenario: 19, note: 'owner example' },
  { text: 'Quà Tết gửi kèm mã QR lạ', scenario: 19, note: 'owner shape 2' },
  { text: 'Kiện hàng bạn chưa đặt kèm mã QR bắt quét', scenario: 19, note: 'owner shape 3' },
]

describe('static scenario matching on SHORT inputs', () => {
  it.each(FIXTURES)('$note — "$text" -> scenario #$scenario (strong)', ({ text, scenario }) => {
    const m = matchScenario(text)
    expect(m, text).not.toBeNull()
    expect(m!.scenario.officialNumber).toBe(scenario)
    expect(m!.strength).toBe('strong')
    expect(m!.score).toBeGreaterThanOrEqual(STRONG_AT)
  })

  it('there are exactly 15 fixtures, 3 of them in the owner shape', () => {
    expect(FIXTURES).toHaveLength(15)
    expect(FIXTURES.filter(f => /kèm mã QR/.test(f.text))).toHaveLength(3)
  })

  it('every scenario in the dataset has a phrase list (a new scenario without one fails here)', () => {
    expect(coveredScenarioNumbers()).toEqual(allScenarios().map(s => s.officialNumber).sort((a, b) => a - b))
  })

  it('works without diacritics and in any case', () => {
    expect(matchScenario('BUU PHAM trung thu kem ma QR')?.scenario.officialNumber).toBe(19)
    expect(matchScenario('phat nguoi kem link')?.scenario.officialNumber).toBe(22)
  })

  it('a bare "kèm mã QR" (could be a real invoice) is only a WEAK match: suspicious, not familiar', () => {
    const m = matchScenario('Hóa đơn tiền điện tháng 9 kèm mã QR thanh toán')
    expect(m?.strength).toBe('weak')
    expect(m!.score).toBeGreaterThanOrEqual(WEAK_AT)
    expect(m!.score).toBeLessThan(STRONG_AT)
  })

  it.each([
    'Mẹ ơi cuối tuần con về nhà ăn cơm',
    'Họp lớp tối thứ sáu nhé, mọi người nhớ đến',
    'Thông báo số dư tài khoản: +500,000 VND lúc 09:15',
    'Shipper GHN đã giao hàng, bạn nhận được chưa?',
    'Mã OTP của bạn là 482913, không chia sẻ cho ai',
    'Chiều nay đi cà phê không?',
    '',
  ])('a normal message claims nothing: %j', text => {
    expect(matchScenario(text)).toBeNull()
  })
})

describe('the whole message pipeline (AI switch OFF, the default)', () => {
  const run = async (text: string, locale: 'vi' | 'en' = 'vi') => {
    const analyzer = fakeAnalyzer()
    const gate = vi.fn(async () => ({ allowed: true as const }))
    const result = await analyzeMessage({ text, locale, aiGate: gate }, { analyzer, urlChecker: tableUrlChecker({}) })
    return { result, analyzer, gate }
  }

  it('"Bưu phẩm Trung thu kèm mã QR" is a familiar verdict with scenario #19, zero tokens, no quota', async () => {
    const { result, analyzer, gate } = await run('Bưu phẩm Trung thu kèm mã QR')
    expect(result.verdict).toBe('familiar')
    expect(result.scenario?.officialNumber).toBe(19)
    expect(result.scenario?.source.url).toMatch(/^https:\/\/bocongan\.gov\.vn\//)
    expect(result.scenario?.hotline).toBe('113')
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.risk.level)
    expect(result.analysis.aiStatus).toBe('not_needed')
    expect(result.analysis.tier).toBe(0)
    expect(analyzer.calls).toHaveLength(0)
    expect(gate).not.toHaveBeenCalled()
  })

  it('"phạt nguội kèm link" is familiar even though a short message with a link used to be LEVEL 0', async () => {
    const { result } = await run('Phạt nguội kèm link https://nop-phat-nguoi.example/tra-cuu')
    expect(result.verdict).toBe('familiar')
    expect(result.scenario?.officialNumber).toBe(22)
  })

  it('a normal message is "unrecognized" with the three do-not lines, never SAFE or LOW', async () => {
    const { result } = await run('Chiều nay đi cà phê không?')
    expect(result.verdict).toBe('unrecognized')
    expect(result.risk.level).toBe('INCONCLUSIVE')
    expect(result.scenario).toBeNull()
    expect(result.advice.doNot.map(a => a.code)).toEqual(['NO_TRANSFER', 'NO_OTP', 'NO_CLICK_LINK'])
    expect(result.reasoningSummary).toMatch(/Chưa nhận ra dấu hiệu quen thuộc.*KHÔNG có nghĩa là an toàn/)
  })

  it('an English request gets the English wording', async () => {
    const { result } = await run('Chiều nay đi cà phê không?', 'en')
    expect(result.reasoningSummary).toMatch(/No familiar signs recognised.*does NOT mean it is safe/)
  })
})

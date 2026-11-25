import { describe, it, expect } from 'vitest'
import { evaluateRules } from '../rules'
import { normalizeMessage } from '../normalize'
import { analyzeMessage } from '../index'
import { fakeAnalyzer, tableUrlChecker } from './fixtures'

// UAT 18/11/2026 — two false positives on clean text, and the real scams that must stay HIGH.

const rules = (text: string, locale: 'vi' | 'en' = 'vi', hasUrl = false) => evaluateRules(normalizeMessage(text).text, locale, hasUrl)
const run = (text: string, locale: 'vi' | 'en' = 'vi') =>
  analyzeMessage({ text, locale, aiGate: false }, { aiEnabled: false, analyzer: fakeAnalyzer(), urlChecker: tableUrlChecker({}) })

const LUNCH_VI = 'Hôm nay mình trả tiền ăn trưa, bạn gửi số tài khoản nhé'
const LUNCH_EN = 'I will pay for lunch today, please send me your account number'
const MOH_NOTICE_VI = 'Bộ Y tế thông báo: chúng tôi KHÔNG BAO GIỜ yêu cầu bạn chuyển tiền hoặc cung cấp mã OTP qua điện thoại hay tin nhắn.'
const MOH_NOTICE_EN = 'Ministry of Health notice: we NEVER ask you to transfer money or give an OTP by phone or message.'

describe('false positive 1 — a mention of an account number / bank transfer is not a demand', () => {
  for (const [name, text, locale] of [['vi', LUNCH_VI, 'vi'], ['en', LUNCH_EN, 'en']] as const) {
    it(`a lunch message (${name}) raises no signal and is not HIGH`, async () => {
      const r = rules(text, locale)
      expect(r.signals.map(s => s.type)).toEqual([])
      expect(r.floor).toBeNull()
      const res = await run(text, locale)
      expect(['HIGH', 'CRITICAL']).not.toContain(res.risk.level)
      expect(res.risk.score).toBeLessThan(31)
    })
  }

  it('a bare "chuyển khoản" mention is not a transfer request', () => {
    expect(rules('Mình đã chuyển khoản cho bạn rồi nhé').signals.map(s => s.type)).not.toContain('transfer_request')
    expect(rules('Cảm ơn bạn, mình thích chuyển khoản hơn tiền mặt').signals.map(s => s.type)).not.toContain('transfer_request')
    expect(rules('I paid by bank transfer yesterday').signals.map(s => s.type)).not.toContain('transfer_request')
  })

  it('an account number demanded under pressure still counts', () => {
    const r = rules('Gửi số tài khoản của bạn ngay lập tức, nếu không tài khoản sẽ bị khóa. Chuyển khoản phí xử lý 500.000đ trong 24 giờ.')
    expect(r.signals.map(s => s.type)).toEqual(expect.arrayContaining(['transfer_request']))
    expect(r.floor).toBe('HIGH')
  })
})

describe('false positive 2 — an official notice that says "we never ask you to transfer money / give an OTP"', () => {
  for (const [name, text, locale] of [['vi', MOH_NOTICE_VI, 'vi'], ['en', MOH_NOTICE_EN, 'en']] as const) {
    it(`(${name}) fires neither transfer_request nor otp_request, and scores below MEDIUM`, async () => {
      const types = rules(text, locale).signals.map(s => s.type)
      expect(types).not.toContain('transfer_request')
      expect(types).not.toContain('otp_request')
      const res = await run(text, locale)
      expect(res.risk.score).toBeLessThan(31)
    })
  }

  it('a condition is not a negation: "if you do not transfer" is still a threat', () => {
    expect(rules('Nếu bạn không chuyển tiền ngay, tài khoản sẽ bị khóa').signals.map(s => s.type)).toContain('transfer_request')
    expect(rules('If you do not transfer money today your account will be closed').signals.map(s => s.type)).toContain('transfer_request')
  })
})

describe('real scam texts stay HIGH', () => {
  const SCAMS = [
    'Công an thông báo bạn liên quan vụ án rửa tiền. Hãy chuyển tiền vào tài khoản tạm giữ 0123456789 ngay hôm nay để xác minh.',
    'Ngân hàng thông báo tài khoản của bạn bị khóa. Vui lòng cung cấp mã OTP ngay để mở khóa.',
    'Bạn đã trúng thưởng! Nộp phí nhận thưởng 500.000đ chuyển khoản trong 24 giờ để nhận quà.',
    'Your account will be suspended. Transfer the processing fee immediately to unlock it.',
  ]
  for (const text of SCAMS) {
    it(text.slice(0, 40), () => {
      const r = rules(text, /[a-z]/.test(text) && /Your account/.test(text) ? 'en' : 'vi')
      expect(r.floor).toBe('HIGH')
    })
  }
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { vi as verdictVi, en as verdictEn, scamVerdictText } from '@/lib/i18n/scamVerdict'
import { vi as qrVi, en as qrEn } from '@/lib/i18n/scamQr'
import { linkVerdict, messageVerdict, publicLevel, toPublicCheckResult } from '../verdict'
import { urlResult } from '../message/__tests__/fixtures'
import { getRecommendedActions } from '../engine/actionEngine'
import { buildScamSharePayload } from '@/lib/share/scamSharePayload'
import { matchScenario } from '../knowledge/match'
import type { RiskLevel } from '../types'

// ── Scam Shield wording rules (owner 02/10, legal risk) ─────────────────────
//   * three states only; never "An toàn" / "Safe", never a number, never "Độ tin cậy";
//   * a link is never declared a scam by name;
//   * every state carries "TappyAI không thay thế cơ quan chức năng";
//   * the server never sends SAFE/LOW to the Android/iOS apps (they print "An toàn" for SAFE).

const LEVELS: RiskLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INCONCLUSIVE']

describe('exact wording of the three states', () => {
  it('message states', () => {
    expect(verdictVi['scamVerdict.familiar.title']).toBe('Có dấu hiệu lừa đảo quen thuộc')
    expect(verdictVi['scamVerdict.suspicious.title']).toBe('Có một số dấu hiệu đáng ngờ')
    expect(`${verdictVi['scamVerdict.unrecognized.title']}. ${verdictVi['scamVerdict.unrecognized.body']}`).toBe(
      'Chưa nhận ra dấu hiệu quen thuộc. Điều này KHÔNG có nghĩa là an toàn: đừng chuyển tiền, đừng đọc mã OTP, đừng bấm link lạ; hãy xác minh qua kênh chính thức.',
    )
  })
  it('link states say "traits common in fake links", never "this link is a scam"', () => {
    expect(verdictVi['scamVerdict.link.familiar.title']).toBe('Đường link có đặc điểm thường gặp ở link giả mạo')
    expect(verdictEn['scamVerdict.link.familiar.title']).not.toMatch(/is a scam|is fake|is fraud/i)
    for (const t of Object.values(verdictVi)) expect(t).not.toMatch(/đây là (trang|link|website) lừa đảo|link này là lừa đảo/i)
  })
  it('the authorities line exists in both languages', () => {
    expect(verdictVi['scamVerdict.disclaimer']).toBe('TappyAI không thay thế cơ quan chức năng.')
    expect(verdictEn['scamVerdict.disclaimer']).toMatch(/does not replace the authorities/)
  })
})

describe('no reassurance and no numbers anywhere in the verdict dictionaries', () => {
  const all = [...Object.entries(verdictVi), ...Object.entries(verdictEn), ...Object.entries(qrVi), ...Object.entries(qrEn)]
  it.each(all)('%s', (_k, text) => {
    // "KHÔNG có nghĩa là an toàn" / "does NOT mean it is safe" are the owner's own words and are allowed.
    const stripped = text.replace(/KHÔNG có nghĩa là an toàn/g, '').replace(/does NOT mean it is safe/g, '')
    expect(stripped).not.toMatch(/\ban toàn\b|\bsafe\b|score|độ tin cậy|confidence|điểm rủi ro|nguy cơ thấp|low risk/i)
    expect(text).not.toMatch(/\d+\s*\/\s*100|\d+%/)
  })
})

describe('the public level never says SAFE or LOW', () => {
  it.each(LEVELS)('%s', level => {
    const pub = publicLevel(level)
    expect(['SAFE', 'LOW']).not.toContain(pub)
    if (level === 'SAFE' || level === 'LOW') expect(pub).toBe('INCONCLUSIVE')
    else expect(pub).toBe(level)
  })
  it('link verdict mapping', () => {
    expect(linkVerdict('SAFE')).toBe('unrecognized')
    expect(linkVerdict('LOW')).toBe('unrecognized')
    expect(linkVerdict('INCONCLUSIVE')).toBe('unrecognized')
    expect(linkVerdict('MEDIUM')).toBe('suspicious')
    expect(linkVerdict('HIGH')).toBe('familiar')
    expect(linkVerdict('CRITICAL')).toBe('familiar')
  })
  it('message verdict: a strong scenario match wins over a quiet level, a weak one is suspicious', () => {
    expect(messageVerdict('INCONCLUSIVE', matchScenario('Bưu phẩm Trung thu kèm mã QR'))).toBe('familiar')
    expect(messageVerdict('INCONCLUSIVE', matchScenario('Hóa đơn điện kèm mã QR'))).toBe('suspicious')
    expect(messageVerdict('INCONCLUSIVE', null)).toBe('unrecognized')
    expect(messageVerdict('HIGH', null)).toBe('familiar')
  })
  it('toPublicCheckResult rewrites SAFE/LOW, keeps the internal score for old clients, and adds the verdict', () => {
    const r = toPublicCheckResult(urlResult('https://example.com/', 'SAFE', 3, 95))
    expect(r.risk.level).toBe('INCONCLUSIVE')
    expect(r.risk.score).toBe(3)
    expect(r.verdict).toBe('unrecognized')
    expect(toPublicCheckResult(urlResult('https://x.cfd/', 'HIGH', 70, 80)).risk.level).toBe('HIGH')
  })
  it('no recommended action for any level reads as "looks safe"', () => {
    for (const level of LEVELS) {
      for (const a of getRecommendedActions(level, { items: [], summary: { criticalCount: 0, warningCount: 0, safeCount: 0, totalSources: 0, respondedSources: 0 } }, null, 100)) {
        expect(a.action).not.toBe('LIKELY_SAFE')
        const text = `${a.label_vi} ${a.label_en}`.replace(/KHÔNG có nghĩa là an toàn/g, '').replace(/does NOT mean it is safe/g, '')
        expect(text).not.toMatch(/có vẻ an toàn|appears safe|looks safe/i)
      }
    }
  })
})

describe('a public share page', () => {
  it('has no score, no confidence figure and no safety claim for any level', () => {
    for (const level of LEVELS) {
      for (const locale of ['vi', 'en'] as const) {
        const p = buildScamSharePayload(toPublicCheckResult(urlResult('https://example.com/', level, 55, 90)), locale)
        const text = `${p.title}\n${p.body}`.replace(/KHÔNG có nghĩa là an toàn/g, '')
        expect(text).not.toMatch(/\ban toàn\b|\bsafe\b|điểm rủi ro|độ tin cậy|risk score|confidence|\/100/i)
        expect(p.body).toMatch(/TappyAI không thay thế cơ quan chức năng|does not replace the authorities/)
      }
    }
  })
})

describe('the UI never renders a score, a confidence badge or the AI quota', () => {
  const read = (f: string) => readFileSync(`src/app/scam-shield/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  it.each(['ScamShieldResult.tsx', 'ScamMessageResult.tsx', 'ScamShieldView.tsx'])('%s', f => {
    const src = read(f)
    expect(src).not.toMatch(/ConfidenceBadge|risk\.score|risk\.confidence|>\s*Score\s*</)
    expect(src).not.toMatch(/aiToday|aiLeft|quotaHint|AnalysisNote|data-scam-ai-note/)
  })
  it('the verdict dictionary is registered for the web UI', () => {
    expect(scamVerdictText('vi', 'scamVerdict.familiar.title')).toBe('Có dấu hiệu lừa đảo quen thuộc')
    expect(scamVerdictText('en', 'scamVerdict.unrecognized.title')).toBe('No familiar signs recognised')
  })
})

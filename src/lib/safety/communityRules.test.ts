import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LADDER, RULE_GROUPS, RULE_GROUP_IDS, REPORT_REASON_PRIORITY, countsAsStrike, strikeExpiry, suggestPenalty, withinGroupMax, LEDGER_OUTCOME } from './communityRules'
import { communityEn, communityVi } from '@/lib/i18n/communityGuidelines'
import { reporterStatus, isOverdue, isAtRisk, REPORT_TARGET_HOURS, noticeFor, withinAppealWindow } from './moderationDecisions'

const sql = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8')
const D = sql('supabase/migrations/20261001d_moderation_standards.sql')

describe('community rules — one table, in step with the database', () => {
  it('ten groups; the migration CHECK lists exactly the same ids', () => {
    expect(RULE_GROUP_IDS).toHaveLength(10)
    const m = /moderation_decisions_group_check CHECK \(rule_group IN \(([^)]*)\)/.exec(D)![1]
    expect([...m.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()).toEqual([...RULE_GROUP_IDS].sort())
  })

  it('the severe groups jump the queue and carry a 24 h target; severity never exceeds what the group allows', () => {
    for (const id of ['child_safety', 'sexual', 'violence_selfharm'] as const) {
      expect(RULE_GROUPS[id].priority).toBe(3); expect(RULE_GROUPS[id].targetHours).toBe(24)
    }
    for (const g of Object.values(RULE_GROUPS)) { expect(g.defaultSeverity).toBeLessThanOrEqual(g.maxSeverity); expect([1, 2, 3]).toContain(g.defaultSeverity) }
    expect(RULE_GROUPS.child_safety.defaultSeverity).toBe(3)
  })

  it('the queue priority of a report reason matches the trigger in the migration', () => {
    const sev3 = /WHEN NEW\.reason IN \(([^)]*)\) THEN 3/.exec(D)![1]
    const sev2 = /WHEN NEW\.reason IN \(([^)]*)\) THEN 2/.exec(D)![1]
    const ids = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
    expect(ids(sev3)).toEqual(Object.entries(REPORT_REASON_PRIORITY).filter(([, p]) => p === 3).map(([r]) => r).sort())
    for (const r of ids(sev2)) expect(REPORT_REASON_PRIORITY[r]).toBe(2)
  })
})

describe('the ladder — proposals, never automatic', () => {
  it('strikes expire by severity (90 / 180 days, severity 3 never); warnings and no-violation are no strike', () => {
    const t0 = new Date('2026-10-01T00:00:00Z')
    expect(strikeExpiry(1, t0)!.toISOString()).toBe('2026-12-30T00:00:00.000Z')
    expect(strikeExpiry(2, t0)!.getTime() - t0.getTime()).toBe(180 * 86_400_000)
    expect(strikeExpiry(3, t0)).toBeNull()
    expect(countsAsStrike('warning')).toBe(false); expect(countsAsStrike('no_violation')).toBe(false)
    for (const o of ['content_removed', 'restricted', 'banned'] as const) expect(countsAsStrike(o)).toBe(true)
    expect(LEDGER_OUTCOME.remove).toBe('content_removed')
  })

  it('suggestions: a first minor violation is a warning; repeat → remove; thresholds → restrict, ban; severity 3 → ban', () => {
    const base = { group: 'spam' as const, severity: 1 as const, strikesSameGroupFeature: 0, strikesTotal: 0 }
    expect(suggestPenalty(base)).toMatchObject({ outcome: 'warning' })
    expect(suggestPenalty({ ...base, severity: 2, group: 'harassment' })).toMatchObject({ outcome: 'remove' })
    expect(suggestPenalty({ ...base, strikesSameGroupFeature: LADDER.restrictAtStrikes - 1, strikesTotal: 2 })).toMatchObject({ outcome: 'restrict', restrictDays: LADDER.restrictDaysDefault })
    expect(suggestPenalty({ ...base, strikesTotal: LADDER.banAtStrikes - 1 })).toMatchObject({ outcome: 'ban', why: 'ban_threshold' })
    expect(suggestPenalty({ ...base, group: 'child_safety', severity: 3 })).toMatchObject({ outcome: 'ban', why: 'severity3' })
  })

  it('a group caps the penalty: spam tops out at a restriction, the severe ones may ban', () => {
    expect(withinGroupMax('spam', 'restrict')).toBe(true); expect(withinGroupMax('spam', 'ban')).toBe(false)
    expect(withinGroupMax('child_safety', 'ban')).toBe(true)
  })

  it('published wording: a dated effective line, no "awaiting approval" banner, no strike thresholds, 24 h for every report, no report-status promise', () => {
    for (const t of [communityVi, communityEn]) {
      expect(t['legal.community.effective']).not.toMatch(/chờ chủ sản phẩm duyệt|awaiting|Proposed|Bản đề xuất/i)
      expect(t['legal.community.ladder.note']).not.toMatch(/đề xuất|proposal|Proposed|Mốc/i)
      expect(t['legal.community.ladder.note']).not.toMatch(/\b[35] (strike|active strikes)/i)
    }
    expect(communityEn['legal.community.effective']).toBe('Effective Date: 10 October 2026')
    expect(communityVi['legal.community.effective']).toBe('Ngày hiệu lực: 10 tháng 10 năm 2026')
    expect(communityEn['legal.community.reports.b1']).toMatch(/request for review, not a finding/)
    expect(communityVi['legal.community.reports.b1']).toMatch(/không phải kết luận/)
    expect(communityEn['legal.community.reports.b4']).toMatch(/Every report has a target of 24 hours/)
    expect(communityVi['legal.community.reports.b4']).toMatch(/Mọi báo cáo có mục tiêu .* 24 giờ/)
    expect(JSON.stringify([communityEn, communityVi])).not.toMatch(/48 hours|72 hours|48 giờ|72 giờ|received, in review|đã nhận, đang xem xét/)
    expect(communityEn['legal.community.appeal.p1']).toMatch(/by email/); expect(communityEn['legal.community.appeal.p1']).not.toMatch(/Violation notices/)
    expect(communityVi['legal.community.appeal.p1']).toMatch(/qua email/)
  })
})

describe('the Community Guidelines copy', () => {
  it('both languages carry the same keys and every group has heading, lead, three examples and a severity/penalty note', () => {
    expect(Object.keys(communityVi).sort()).toEqual(Object.keys(communityEn).sort())
    for (const id of RULE_GROUP_IDS) for (const k of ['heading', 'lead', 'b1', 'b2', 'b3', 'note']) {
      expect(communityVi[`legal.community.r.${id}.${k}`], `${id}.${k}`).toBeTruthy()
      expect(communityEn[`legal.community.r.${id}.${k}`], `${id}.${k}`).toBeTruthy()
    }
  })
  it('says a report removes nothing, the reporter hides it only for themselves, severe groups come first, one appeal', () => {
    expect(communityEn['legal.community.reports.b1']).toMatch(/never automatically/)
    expect(communityEn['legal.community.reports.b3']).toMatch(/for yourself/)
    expect(communityEn['legal.community.reports.b4']).toMatch(/24 hours/)
    expect(communityEn['legal.community.appeal.p1']).toMatch(/once/)
    expect(communityVi['legal.community.reports.b1']).toMatch(/không bao giờ tự động/)
  })
})

describe('small helpers', () => {
  it('the reporter sees only four states', () => {
    expect(['pending', 'in_review', 'resolved', 'dismissed', undefined].map(reporterStatus)).toEqual(['received', 'in_review', 'actioned', 'no_violation', 'received'])
  })
  it('overdue: EVERY report after 24 h (Apple 1.2), whatever its priority', () => {
    const now = new Date('2026-10-04T00:00:00Z')
    const at = (h: number, m = 0) => new Date(now.getTime() - h * 3_600_000 - m * 60_000).toISOString()
    for (const priority of [0, 1, 2, 3]) {
      expect(isOverdue(priority, at(24), now)).toBe(false)     // exactly 24 h: not yet
      expect(isOverdue(priority, at(24, 1), now)).toBe(true)   // 24 h 1 min: overdue, even for a routine report
      expect(isOverdue(priority, at(2), now)).toBe(false)
    }
    // at risk = in the last 12 h before the 24 h target
    expect(isAtRisk(1, at(12), now)).toBe(false); expect(isAtRisk(1, at(12, 1), now)).toBe(true)
    expect(isAtRisk(1, at(24), now)).toBe(true); expect(isAtRisk(1, at(24, 1), now)).toBe(false)
    expect(REPORT_TARGET_HOURS).toBe(24)
  })
  it('every rule group prints and tracks the same 24 h target (no group is promised a longer clock)', () => {
    for (const g of Object.values(RULE_GROUPS)) expect(g.targetHours).toBe(REPORT_TARGET_HOURS)
  })
  it('the appeal window is 30 days', () => {
    expect(withinAppealWindow('2026-09-10T00:00:00Z', new Date('2026-10-01T00:00:00Z'))).toBe(true)
    expect(withinAppealWindow('2026-08-01T00:00:00Z', new Date('2026-10-01T00:00:00Z'))).toBe(false)
  })
  it('the notice names the rule, the penalty and the appeal — and nothing of the content or the reporter', () => {
    const n = noticeFor({ decisionId: 'd1', ruleGroup: 'harassment', outcome: 'restricted', restrictDays: 7, contentType: 'comment', strikeExpiresAt: '2027-03-30T00:00:00Z' })
    expect(n.body).toContain('Quấy rối và bắt nạt'); expect(n.body).toContain('7 ngày'); expect(n.body).toContain('support@tappyai.com'); expect(n.body).toContain('Harassment and bullying')
    expect(n.entityUrl).toBe('/profile/notices?d=d1')
  })
})

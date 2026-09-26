import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentSubjectMessages, currentSubjectUserTexts } from './subjectScope'
import { deriveNeedProfile } from './needProfile'
import { extractPlanTotalBudget } from '@/lib/ai/budget'

// PRELAUNCH UAT, Android, 2026-09-25 (golden B4): a headphone budget ("dưới 2 triệu") became the
// Vũng Tàu trip's total budget on the next subject — the reply said "ngân sách 2 triệu" and the
// trip's place rows were filtered to 2,000,000. Two carriers, both read the whole thread:
// the planning fold (last 3 user turns) and the need profile (resets only on a venue noun).

const thread = [
  { role: 'user', content: 'Tư vấn tai nghe chống ồn dưới 2 triệu' },
  { role: 'assistant', content: 'Bạn ưu tiên chất lượng âm thanh hay thời lượng pin?' },
  { role: 'user', content: 'Cân bằng cả hai' },
  { role: 'assistant', content: 'Mình chọn tai nghe này cho bạn.' },
  { role: 'user', content: 'Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người' },
]
const opts = { hasGps: true, lang: 'vi' }

describe('a trip plan does not inherit the previous subject\'s budget (golden B4)', () => {
  it('the current subject is the trip turn alone', () => {
    expect(currentSubjectUserTexts(thread, opts)).toEqual(['Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người'])
  })

  it('the plan\'s total budget, folded over the subject, is empty (it was 2,000,000 over the thread)', () => {
    const fold = (texts: string[]) => texts.slice().reverse().map(extractPlanTotalBudget).find(v => v !== null) ?? null
    const users = thread.filter(m => m.role === 'user').map(m => m.content)
    expect(fold(users.slice(-4))).toBe(2_000_000) // the defect, as measured
    expect(fold(currentSubjectUserTexts(thread, opts).slice(-4))).toBeNull()
  })

  it('the need profile over the subject carries no budget (the whole-thread profile did)', () => {
    expect(deriveNeedProfile(thread).budget).not.toBeNull() // the defect, as measured
    expect(deriveNeedProfile(currentSubjectMessages(thread, opts)).budget).toBeNull()
  })

  it('a budget stated INSIDE the plan subject still counts', () => {
    const t = [...thread, { role: 'assistant', content: 'Bạn muốn ngân sách bao nhiêu?' }, { role: 'user', content: 'tổng 3 triệu cho cả 2 người' }]
    const users = currentSubjectUserTexts(t, opts)
    expect(users[0]).toBe('Lên lịch trình 1 ngày ở Vũng Tàu cho 2 người')
    expect(users.slice().reverse().map(extractPlanTotalBudget).find(v => v !== null)).toBe(3_000_000)
  })

  it('route.ts folds the plan and derives the need profile over the current subject', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain('const priorUserTexts: string[] = subjectUserTexts.slice(-4, -1)')
    expect(src).toContain('deriveNeedProfile(currentSubjectMessages(framingMessages, { hasGps: !!userLocation, lang })')
  })
})

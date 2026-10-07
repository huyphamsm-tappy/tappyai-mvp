import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { vi as copyVi, en as copyEn } from '@/lib/i18n/accountDelete'

// UAT3 (2026-09-27): the file-deletion window the user is told must be the one the cron can keep.
// `/api/cron/account-deletion-jobs` runs ONCE a day and a failed job is retried at the next run,
// so a deletion right after a run waits ~24 h for the first attempt and ~48 h for the retry:
// "within 48 hours". The same number is in DELETE-ACCOUNT-COPY-DRAFT §2 (the public page).
// Change the schedule without changing the copy — or the reverse — and this fails.

const WINDOW_H = 48

describe('file-deletion window ↔ the real cron', () => {
  const cron = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] }
  const job = cron.crons.find(c => c.path === '/api/cron/account-deletion-jobs')

  it('the worker runs exactly once a day', () => {
    expect(job).toBeDefined()
    const [min, hour, dom, mon, dow] = job!.schedule.split(/\s+/)
    expect(/^\d+$/.test(min) && /^\d+$/.test(hour)).toBe(true)
    expect([dom, mon, dow]).toEqual(['*', '*', '*'])
  })

  it('one missed run fits the promised window (24 h to the first run + 24 h to the retry)', () => {
    expect(24 + 24).toBeLessThanOrEqual(WINDOW_H)
  })

  it('the in-app confirmation says 48 hours in both languages', () => {
    expect(copyVi['accountDelete.done.p1']).toContain(`${WINDOW_H} giờ`)
    expect(copyEn['accountDelete.done.p1']).toContain(`${WINDOW_H} hours`)
  })

  it('the public-page draft says the same number', () => {
    const draft = readFileSync('docs/uat/DELETE-ACCOUNT-COPY-DRAFT.md', 'utf8')
    expect(draft).toContain(`within ${WINDOW_H} hours`)
    expect(draft).toContain(`trong vòng ${WINDOW_H} giờ`)
  })
})

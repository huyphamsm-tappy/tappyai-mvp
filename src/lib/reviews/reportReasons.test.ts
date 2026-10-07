import { describe, it, expect } from 'vitest'
import { REPORT_REASONS, isReportReason } from './reportReasons'
import { vi, en } from '@/lib/i18n/w2/reviews'

// F-031 — the report reasons are shared by the API route (which 400s anything not
// in the list) and the feed UI (which renders one button per reason). These guard
// the two ways that contract silently breaks: a client offering a reason the
// server rejects, or a reason with no label to render.
describe('report reasons', () => {
  it('accepts every listed reason and rejects anything else', () => {
    for (const r of REPORT_REASONS) expect(isReportReason(r)).toBe(true)
    for (const bad of ['', 'music', 'SPAM', 'other ', 42, null, undefined]) {
      expect(isReportReason(bad)).toBe(false)
    }
  })

  it('has a label for every reason in both locales', () => {
    for (const r of REPORT_REASONS) {
      const key = `reviews.reportReason.${r}`
      expect(vi[key], `vi ${key}`).toBeTruthy()
      expect(en[key], `en ${key}`).toBeTruthy()
    }
    // The menu chrome the UI shows around the reasons.
    for (const key of ['reviews.report', 'reviews.reportThanks', 'reviews.reportFailed']) {
      expect(vi[key], `vi ${key}`).toBeTruthy()
      expect(en[key], `en ${key}`).toBeTruthy()
    }
  })
})

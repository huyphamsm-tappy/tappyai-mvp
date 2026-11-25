'use client'
// Report layout A (owner 11/11, mockup docs/design/report-mockup): the cover of a finished deep research report - eyebrow, the report's title, and a row of facts the app really
// knows (the day, the number of sources). It shows NOTHING it cannot know: no confidence label, no "insights", no figures - those need structured data the writer does not give yet.
// VIEW ONLY. Behind NEXT_PUBLIC_REPORT_LAYOUT=a (build flag, off by default): without it this is never rendered and the report looks exactly as before.
import './reportLayout.css'
import type { ResearchStatus } from '@/lib/ai/research/deepResearch'
import { useTranslation } from '@/lib/i18n/useTranslation'

export const REPORT_LAYOUT_A = process.env.NEXT_PUBLIC_REPORT_LAYOUT === 'a'

export default function ReportCover({ status }: { status: ResearchStatus }) {
  const { t, locale } = useTranslation()
  if (status.phase !== 'done' || !status.title) return null
  const date = new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN')
  // the sources the report cites (its links), as the PDF cover states; the count of everything gathered only when the links are not known; nothing when neither is known
  const sources = status.links?.length || status.sources
  return (
    <header className="tappy-report-cover mb-4" data-testid="report-cover">
      <div className="tappy-report-eyebrow">{t('report.eyebrow')}{status.tier ? ` · ${t(`report.tier.${status.tier}`)}` : ''}</div>
      <h1 className="tappy-report-title">{status.title}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="tappy-report-pill">{t('report.updated', { date })}</span>
        {sources > 0 && <span className="tappy-report-pill">{t('report.sources', { n: String(sources) })}</span>}
      </div>
    </header>
  )
}

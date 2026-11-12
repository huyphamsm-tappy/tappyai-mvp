'use client'
// RFC-001 4.2 / 4.3 + owner 11/11 and 12/11 (NEXT_PUBLIC_RESPONSE_PRESENTATION): what a deep research report looks like IN THE CHAT and where the whole report lives.
//   while it is written : one progress line with the titles of its sections (no section text)
//   when it is done     : a card - the title, the key points (the report's own first section), "Nguồn: N" (a number, never the list or a link) and one button
//   the button          : opens the full report (ResearchCanvas: contents, footnotes, sources list, Copy Markdown and Share, no PDF) over the conversation; Esc or the close button
//                         return to the chat with the focus on the button, the chat's scroll position untouched (the panel is a portal, the chat is never re-laid out)
// VIEW ONLY: the saved message is the whole report, unchanged.
import { useMemo, useState } from 'react'
import { Check, FileText, Loader2 } from 'lucide-react'
import './presentation.css'
import './reportInChat.css'
import ResearchCanvas, { type ResearchCanvasProps } from '@/components/chat/ResearchCanvas'
import { ArticleAnswer } from '@/components/chat/ArticleAnswer'
import OverlayDrawer from '@/components/chat/v206/OverlayDrawer'
import { reportTitleOf } from '@/components/chat/ReportExportBar'
import { reportDigest, reportProgress } from '@/lib/chat/reportDigest'
import { useTranslation } from '@/lib/i18n/useTranslation'

export function ReportProgressLine({ text }: { text: string }) {
  const { t } = useTranslation()
  const p = useMemo(() => reportProgress(text), [text])
  return (
    <div role="status" aria-live="polite" aria-label={t('pres.rep.progressLabel')} className="tappy-rep-progress" data-testid="report-progress">
      <p className="tappy-rep-progress-head"><Loader2 size={14} aria-hidden="true" className="animate-spin" />{t('pres.rep.progress')}</p>
      {(p.done.length > 0 || p.writing) && (
        <ol className="m-0 list-none p-0">
          {p.done.map(title => <li key={title}><Check size={13} aria-hidden="true" />{title}</li>)}
          {p.writing && <li data-writing="true"><Loader2 size={13} aria-hidden="true" className="animate-spin" />{p.writing} · {t('pres.rep.writing')}</li>}
        </ol>
      )}
    </div>
  )
}

export function ReportSummaryCard(p: { title: string; bullets: string; sources: number; format: ResearchCanvasProps['format']; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="tappy-rep-card" aria-label={p.title} data-testid="report-summary-card">
      <h3 className="tappy-rep-title">{p.title}</h3>
      {p.bullets && (
        <div className="tappy-rep-bullets" data-testid="report-bullets">
          <ArticleAnswer text={p.bullets} images={[]} format={p.format} presentation={{ variant: 'doc' }} />
        </div>
      )}
      <div className="tappy-rep-foot">
        {p.sources > 0 && <span className="tappy-rep-sources" data-testid="report-sources-count">{t('pres.rep.sources', { n: String(p.sources) })}</span>}
        <button type="button" className="tappy-rep-open" onClick={p.onOpen} data-testid="report-open"><FileText size={15} aria-hidden="true" />{t('pres.rep.open')}</button>
      </div>
    </section>
  )
}

export default function ReportInChat(p: ResearchCanvasProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const digest = useMemo(() => (p.streaming ? null : reportDigest(p.text, p.research?.links?.length ?? 0)), [p.streaming, p.text, p.research?.links])
  const title = p.research?.title || reportTitleOf(p.text)
  if (p.streaming || !digest) return <ReportProgressLine text={p.text} />
  return (
    <>
      <ReportSummaryCard title={title} bullets={digest.bullets} sources={digest.sources} format={p.format} onOpen={() => setOpen(true)} />
      {open && (
        <OverlayDrawer wide testId="report-panel" title={t('pres.rep.panel')} closeLabel={t('v206.close')} onClose={() => setOpen(false)}>
          <div className="dark">
            {/* the full report: its contents, footnotes and sources list live here only */}
            <ResearchCanvas {...p} streaming={false} collapsed={false}
              onShare={p.onShare ? () => { setOpen(false); setTimeout(() => p.onShare?.(), 60) } : undefined} />
          </div>
        </OverlayDrawer>
      )}
    </>
  )
}

'use client'
// Owner 11/11 ("file pdf đâu"): the download buttons lived only on the research card, and that card is live-only (its annotation is not saved), so a report that was reloaded, or scrolled
// away from, had no way to be exported. This bar is shown under a finished report recognised by its TEXT (requestHistory.looksLikeReport: long, several sections) when the research card is
// not there. It exports from the message text alone: Markdown, Word, PDF (built in the browser, nothing is sent anywhere). The sources are already inside the text; pictures and charts,
// which come from the live annotation, are not in these files.
import { useState } from 'react'
import { downloadBlob, reportFileName, reportMarkdown, sourceCountOf } from '@/lib/answerDoc/reportExport'
import { downloadReportPdf } from '@/lib/answerDoc/reportPdf'
import { pdfCoverOf } from '@/components/chat/reportPdfCover'
import { useTranslation } from '@/lib/i18n/useTranslation'

/** The report's title: its first "# " heading, else its first line. */
export function reportTitleOf(text: string): string {
  const h = text.split('\n').find(l => /^#\s/.test(l))
  return (h ? h.replace(/^#\s+/, '') : text.split('\n').find(l => l.trim()) ?? 'report').replace(/[*_`]/g, '').trim().slice(0, 120)
}

export default function ReportExportBar({ report, format }: { report: string; format: (s: string) => string }) {
  const { t, locale } = useTranslation()
  const [busy, setBusy] = useState(false)
  const title = reportTitleOf(report)
  const asMarkdown = () => downloadBlob(new Blob([reportMarkdown(report, [])], { type: 'text/markdown;charset=utf-8' }), reportFileName(title, 'md'))
  // 15/11 (owner): a PDF file that downloads on one click, not the browser's print dialog
  const asPdf = async () => {
    setBusy(true)
    try { await downloadReportPdf(report, [], title, pdfCoverOf(t, locale, title, undefined, sourceCountOf(report, []))) } finally { setBusy(false) }
  }
  const asWord = async () => {
    setBusy(true)
    try {
      const { reportDocx } = await import('@/lib/answerDoc/reportDocx')
      downloadBlob(await reportDocx(report, [], title), reportFileName(title, 'docx'))
    } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="report-export-bar">
      <span className="text-xs text-gray-500 dark:text-gray-400">{t('research.download')}</span>
      {([{ key: 'md', label: 'Markdown', act: asMarkdown }, { key: 'docx', label: 'Word', act: asWord }, { key: 'pdf', label: 'PDF', act: asPdf }] as const).map(b => (
        <button key={b.key} type="button" disabled={busy} onClick={() => { void b.act() }} data-testid={`report-export-${b.key}`}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          {b.label}
        </button>
      ))}
    </div>
  )
}

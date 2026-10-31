'use client'
// 31/10 (mode "Nghiên cứu sâu"): the research plan and each step's progress while a deep research runs, like ChatGPT's research card.
// VIEW ONLY - drawn from the server's `tappy.research.v1` annotation (readResearchStatus); the report itself is the message text under it.
// Labels from the i18n dictionaries (research.*); the title and step lines are the plan's own words, shown as plain text.
// Owner 31/10: a finished report downloads as Markdown, Word or PDF (lib/answerDoc/reportExport.ts - built here, nothing is sent anywhere).
import { useState } from 'react'
import type { ResearchStatus } from '@/lib/ai/research/deepResearch'
import { downloadBlob, printHtml, reportFileName, reportHtml, reportMarkdown, type ReportImage } from '@/lib/answerDoc/reportExport'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'

const MARK: Record<ResearchStatus['steps'][number]['status'], string> = { pending: '○', running: '◌', done: '✓', failed: '–' }

export default function ResearchCard({ status, report, images = [], format }: { status: ResearchStatus; report?: string; images?: readonly ReportImage[]; format?: (s: string) => string }) {
  const { t, locale } = useTranslation()
  const [busy, setBusy] = useState(false)
  const working = status.phase === 'planning' || status.phase === 'researching' || status.phase === 'writing'
  const links = status.links ?? []
  const canExport = status.phase === 'done' && !!report && !!format
  const title = status.title || 'report'
  const asMarkdown = () => downloadBlob(new Blob([reportMarkdown(report!, links)], { type: 'text/markdown;charset=utf-8' }), reportFileName(title, 'md'))
  const asPdf = () => printHtml(reportHtml(report!, { title, images, links, format: format!, lang: locale }))
  const asWord = async () => {
    setBusy(true)
    try {
      const { reportDocx } = await import('@/lib/answerDoc/reportDocx')
      downloadBlob(await reportDocx(report!, links, title), reportFileName(title, 'docx'))
    } finally { setBusy(false) }
  }
  return (
    <div className="mb-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4 shadow-sm" data-testid="research-card" data-phase={status.phase}>
      <div className="flex items-center gap-2 text-xs font-medium text-primary-700 dark:text-primary-300">
        <span aria-hidden="true">🔎</span>
        <span role="status" aria-live="polite" className={cn(working && 'animate-pulse')}>{t(`research.${status.phase}`, { sources: String(status.sources) })}</span>
      </div>
      {status.title && <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{status.title}</div>}
      {status.steps.length > 0 && (
        <ol className="mt-2 space-y-1">
          {status.steps.map((s, i) => (
            <li key={i} className={cn('flex gap-2 text-sm', s.status === 'done' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')} data-step-status={s.status}>
              <span aria-hidden="true" className={cn('w-4 flex-shrink-0 text-center', s.status === 'running' && 'animate-spin', s.status === 'done' && 'text-primary-600')}>{MARK[s.status]}</span>
              <span className="min-w-0">{s.title}</span>
            </li>
          ))}
        </ol>
      )}
      {links.length > 0 && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-2" data-testid="research-links">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('research.sources')}</div>
          <ol className="space-y-0.5">
            {links.map(l => (
              <li key={l.id} className="flex gap-1.5 text-xs">
                <span className="text-gray-400">{l.id}.</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate text-primary-700 hover:underline dark:text-primary-300">{l.title || new URL(l.url).hostname}</a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {canExport && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3" data-testid="research-export">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('research.download')}</span>
          {([
            { key: 'md', label: 'Markdown', act: asMarkdown },
            { key: 'docx', label: 'Word', act: asWord },
            { key: 'pdf', label: 'PDF', act: asPdf },
          ] as const).map(b => (
            <button key={b.key} type="button" disabled={busy} onClick={() => { void b.act() }} data-testid={`research-export-${b.key}`}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

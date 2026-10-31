'use client'
// 31/10 (mode "Nghiên cứu sâu"): the research plan and each step's progress while a deep research runs, like ChatGPT's research card.
// VIEW ONLY - drawn from the server's `tappy.research.v1` annotation (readResearchStatus); the report itself is the message text under it.
// Labels from the i18n dictionaries (research.*); the title and step lines are the plan's own words, shown as plain text.
import type { ResearchStatus } from '@/lib/ai/research/deepResearch'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'

const MARK: Record<ResearchStatus['steps'][number]['status'], string> = { pending: '○', running: '◌', done: '✓', failed: '–' }

export default function ResearchCard({ status }: { status: ResearchStatus }) {
  const { t } = useTranslation()
  const busy = status.phase === 'planning' || status.phase === 'researching' || status.phase === 'writing'
  return (
    <div className="mb-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4 shadow-sm" data-testid="research-card" data-phase={status.phase}>
      <div className="flex items-center gap-2 text-xs font-medium text-primary-700 dark:text-primary-300">
        <span aria-hidden="true">🔎</span>
        <span role="status" aria-live="polite" className={cn(busy && 'animate-pulse')}>{t(`research.${status.phase}`, { sources: String(status.sources) })}</span>
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
      {status.links && status.links.length > 0 && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-2" data-testid="research-links">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('research.sources')}</div>
          <ol className="space-y-0.5">
            {status.links.map(l => (
              <li key={l.id} className="flex gap-1.5 text-xs">
                <span className="text-gray-400">{l.id}.</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate text-primary-700 hover:underline dark:text-primary-300">{l.title || new URL(l.url).hostname}</a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

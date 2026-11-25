'use client'
// The line under a collapsed research report: how many sources it rests on (nothing when not known) and the button that opens the full report or folds it back. View only; see lib/chat/reportView.ts.
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ReportViewBar({ sources, expanded, onToggle }: { sources: number; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" data-testid="report-view-bar">
      {sources > 0 && <span className="text-gray-500 dark:text-gray-400">{t('report.basedOn', { n: String(sources) })}</span>}
      <button type="button" onClick={onToggle} data-testid="report-view-toggle"
        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
        {expanded ? t('report.collapse') : t('report.viewFull')}
      </button>
    </div>
  )
}

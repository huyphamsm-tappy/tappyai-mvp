'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatKnowledgeDate, staticKnowledgeMeta, type KnowledgeMeta } from '@/lib/scam-shield/knowledge'

// "Cập nhật lần cuối: dd/mm/yyyy" + the official source link — from the knowledge's verifiedAt (the weekly sync's last check, or the static
// dataset's own date when the sync has stored nothing). The date and the link are the Ministry's page and our check of it, never a model's words.

export default function KnowledgeFreshness({ meta, className = '' }: { meta?: KnowledgeMeta | null; className?: string }) {
  const { t } = useTranslation()
  const m = meta ?? staticKnowledgeMeta()
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] ${className}`} style={{ color: 'var(--v3-fg-muted)' }} data-scam-knowledge-updated={m.verifiedAt}>
      <span>{t('v3.scam.kb.lastUpdated', { date: formatKnowledgeDate(m.verifiedAt) })}</span>
      <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline" style={{ color: 'var(--v3-emerald)' }}>
        <ExternalLink size={12} aria-hidden="true" />
        {t('v3.scam.kb.lastUpdatedSource')}: {m.organization}
      </a>
    </p>
  )
}

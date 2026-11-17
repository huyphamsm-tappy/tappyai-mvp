// The cover of the downloaded PDF, worded as the report's cover on the screen (ReportCover.tsx): "Báo cáo nghiên cứu · TappyAI" (and the tier), the title, "Cập nhật <day>" and "<n> nguồn".
// It states only what the app really knows: the day, and the sources the report lists (nothing when that count is not known). The designed page also needs the labels of its notes and footer.
import type { PdfCover } from '@/lib/answerDoc/reportPdf'

type T = (key: string, vars?: Record<string, string>) => string

export function pdfCoverOf(t: T, locale: string, title: string, tier?: string, sources = 0): PdfCover {
  const date = new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'vi-VN')
  const tierLabel = tier === 'standard' || tier === 'advanced' ? t(`report.tier.${tier}`) : ''
  return {
    eyebrow: `${t('report.eyebrow')}${tierLabel ? ` · ${tierLabel}` : ''}`,
    title,
    facts: [t('report.updated', { date }), ...(sources > 0 ? [t('report.sources', { n: String(sources) })] : [])],
    kind: tierLabel || t('report.eyebrow').split('·')[0].trim(),
    updated: t('report.updated', { date }),
    sources,
    sourcesWord: t('report.sources', { n: '' }).trim(),
    words: { scope: t('report.design.scope'), caveats: t('report.design.caveats'), sources: t('report.design.sources'), footer: t('report.design.footer') },
  }
}

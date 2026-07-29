'use client'

import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'

// Icon + title + description card, shared by Product Overview, Key Features and
// Technology. `as` keeps the surrounding list/article semantics correct.
export default function LandingIconCard({
  icon: Icon,
  titleKey,
  descKey,
  as: Tag = 'li',
  layout = 'row',
  accent = 'primary',
}: {
  icon: LucideIcon
  titleKey: string
  descKey: string
  as?: 'li' | 'article'
  layout?: 'row' | 'stack'
  accent?: 'primary' | 'accent'
}) {
  const { t } = useTranslation()
  const tint =
    accent === 'accent' ? 'bg-accent-500/15 text-accent-400' : 'bg-primary-500/15 text-primary-400'

  return (
    <Tag
      className={cn(
        'rounded-3xl border border-white/10 bg-gray-950/60 p-5 sm:p-6',
        layout === 'row' && 'flex gap-4'
      )}
    >
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-xl',
          layout === 'stack' ? 'h-11 w-11' : 'h-10 w-10',
          tint
        )}
      >
        <Icon size={layout === 'stack' ? 22 : 20} aria-hidden="true" />
      </div>
      <div className={cn(layout === 'stack' && 'mt-4')}>
        <h3 className={layout === 'stack' ? 'text-fluid-h3 font-semibold' : 'font-semibold'}>
          {t(titleKey)}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">{t(descKey)}</p>
      </div>
    </Tag>
  )
}

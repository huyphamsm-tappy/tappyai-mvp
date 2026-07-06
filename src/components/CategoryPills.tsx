'use client'

import Link from 'next/link'
import { CATEGORIES } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function CategoryPills() {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2 sm:gap-2.5 overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 scrollbar-hide">
      {CATEGORIES.map((cat) => (
        <Link
          key={cat.id}
          href={`/chat?category=${cat.id}`}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:border-primary-200 dark:hover:border-primary-800 hover:text-primary-600 dark:hover:text-primary-400 active:scale-95 transition-all"
        >
          <span className="text-base leading-none">{cat.emoji}</span>
          {t(`tag.${cat.id}`)}
        </Link>
      ))}
    </div>
  )
}

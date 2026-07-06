import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MusicCategory } from '../types/category'
import { getCategoryLabel } from '../services/musicService'

interface MusicCategoryTabsProps {
  categories: MusicCategory[]
  activeCategoryId: string | null
  onSelect: (categoryId: string | null) => void
}

export function MusicCategoryTabs({ categories, activeCategoryId, onSelect }: MusicCategoryTabsProps) {
  const { t } = useTranslation()
  if (categories.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 flex-shrink-0 scrollbar-hide">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeCategoryId === null}
        className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          activeCategoryId === null
            ? 'bg-primary-500 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
        }`}
      >
        {t('music.categoryAll')}
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          aria-pressed={activeCategoryId === category.id}
          className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            activeCategoryId === category.id
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          }`}
        >
          {getCategoryLabel(category)}
        </button>
      ))}
    </div>
  )
}

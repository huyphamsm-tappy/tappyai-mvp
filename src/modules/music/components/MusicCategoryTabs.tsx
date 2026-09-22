import { useTranslation } from '@/lib/i18n/useTranslation'
import type { MusicCategory } from '../types/category'
import { getCategoryLabel } from '../services/musicHelpers'

interface MusicCategoryTabsProps {
  categories: MusicCategory[]
  activeCategoryId: string | null
  onSelect: (categoryId: string | null) => void
  /**
   * `default` is the picker sheet's compact grey tabs. `v3` renders the same tabs as the V3
   * surface's `.v3-chip` pills (the ones Home's suggestion row uses) — bigger, token-coloured,
   * bright accent when selected. Same categories, same ids, same `aria-pressed`.
   */
  appearance?: 'default' | 'v3'
}

export function MusicCategoryTabs({ categories, activeCategoryId, onSelect, appearance = 'default' }: MusicCategoryTabsProps) {
  const { t, locale } = useTranslation()
  if (categories.length === 0) return null

  const v3 = appearance === 'v3'
  const pill = (active: boolean) =>
    v3
      ? `v3-chip v3-music-chip flex-shrink-0 focus:outline-none focus-visible:ring-2 ${active ? 'v3-chip-active' : ''}`
      : `flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? 'bg-interactive text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
        }`

  return (
    <div className={v3 ? 'v3-scroll-x -mx-1 flex gap-2.5 px-1 py-1' : 'flex gap-2 overflow-x-auto px-4 pb-3 flex-shrink-0 scrollbar-hide'}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeCategoryId === null}
        className={pill(activeCategoryId === null)}
      >
        {t('music.categoryAll')}
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          aria-pressed={activeCategoryId === category.id}
          className={pill(activeCategoryId === category.id)}
        >
          {getCategoryLabel(category, locale)}
        </button>
      ))}
    </div>
  )
}

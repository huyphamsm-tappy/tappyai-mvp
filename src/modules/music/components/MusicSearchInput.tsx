import { Search, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface MusicSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /**
   * `default` is the picker sheet's compact grey field. `v3` is the Music Library's prominent
   * search bar on the V3 token surface — same input, same behaviour, only the paint differs.
   */
  appearance?: 'default' | 'v3'
}

export function MusicSearchInput({ value, onChange, placeholder, appearance = 'default' }: MusicSearchInputProps) {
  const { t } = useTranslation()
  const v3 = appearance === 'v3'
  return (
    <div className={v3 ? 'relative w-full' : 'relative mx-4 mb-3 flex-shrink-0'}>
      <Search
        size={v3 ? 18 : 16}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${v3 ? 'left-4' : 'left-3 text-gray-400'}`}
        style={v3 ? { color: 'var(--v3-fg-muted)' } : undefined}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('music.searchPlaceholder')}
        aria-label={t('music.searchAriaLabel')}
        className={
          v3
            ? 'v3-music-search w-full rounded-full py-3 pl-12 pr-11 text-[14.5px] focus:outline-none focus-visible:ring-2'
            : 'w-full rounded-full bg-gray-100 dark:bg-gray-800 py-2 pl-9 pr-9 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500'
        }
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('music.clearSearch')}
          className={
            v3
              ? 'absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 focus:outline-none focus-visible:ring-2'
              : 'absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }
          style={v3 ? { color: 'var(--v3-fg-muted)' } : undefined}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

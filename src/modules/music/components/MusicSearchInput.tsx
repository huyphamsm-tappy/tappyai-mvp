import { Search, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface MusicSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function MusicSearchInput({ value, onChange, placeholder }: MusicSearchInputProps) {
  const { t } = useTranslation()
  return (
    <div className="relative mx-4 mb-3 flex-shrink-0">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('music.searchPlaceholder')}
        aria-label={t('music.searchAriaLabel')}
        className="w-full rounded-full bg-gray-100 dark:bg-gray-800 py-2 pl-9 pr-9 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('music.clearSearch')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

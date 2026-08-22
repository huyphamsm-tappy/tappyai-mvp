import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

/**
 * Relative timestamps for lists ("3 minutes ago").
 *
 * B07: this used to hardcode Vietnamese — including the long-lived typo "phúp trước" — and it is
 * called from screens that are otherwise fully translated, so English sessions got a Vietnamese
 * timestamp under an English heading. The translate function is passed in rather than imported so
 * this module stays free of the client-only i18n store.
 */
export function formatRelativeTime(
  date: string | Date,
  t: (key: string, vars?: Record<string, string>) => string,
  locale: 'vi' | 'en' = 'vi',
): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return t('time.justNow')
  if (diffMins < 60) return t('time.minutesAgo', { n: String(diffMins) })
  if (diffHours < 24) return t('time.hoursAgo', { n: String(diffHours) })
  if (diffDays < 7) return t('time.daysAgo', { n: String(diffDays) })
  return d.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')
}

export const CATEGORIES = [
  { id: 'food', label: 'Ăn Uống', emoji: '🍜', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  { id: 'shopping', label: 'Mua Sắm', emoji: '🛍️', color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
  { id: 'entertainment', label: 'Giải Trí', emoji: '🎭', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  { id: 'travel', label: 'Du Lịch', emoji: '✈️', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'spa', label: 'Spa', emoji: '💆', color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' }
] as const

export type CategoryId = typeof CATEGORIES[number]['id']

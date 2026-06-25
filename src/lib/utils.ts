import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'Vừa xong'
  if (diffMins < 60) return `${diffMins} phúp trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  return d.toLocaleDateString('vi-VN')
}

export const CATEGORIES = [
  { id: 'food', label: 'Ăn Uống', emoji: '🍜', color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  { id: 'shopping', label: 'Mua Sắm', emoji: '🛍️', color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
  { id: 'entertainment', label: 'Giải Trí', emoji: '🎭', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  { id: 'travel', label: 'Du Lịch', emoji: '✈️', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'spa', label: 'Spa', emoji: '💆', color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' }
] as const

export type CategoryId = typeof CATEGORIES[number]['id']

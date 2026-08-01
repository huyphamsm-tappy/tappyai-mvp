import Link from 'next/link'
import { ChevronRight, Lock, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuItemProps {
  icon: LucideIcon
  label: string
  description?: string
  href?: string
  comingSoon?: boolean
  danger?: boolean
  /** Signed-out affordance: the row stays a real link (to /login) but shows a
   * lock instead of a chevron, so a guest can see WHAT the feature is before
   * being asked to sign in. Used by the guest Profile screen. */
  locked?: boolean
  /** Accessible name for the lock indicator (localized by the caller). */
  lockedLabel?: string
}

export default function MenuItem({ icon: Icon, label, description, href, comingSoon, danger, locked, lockedLabel }: MenuItemProps) {
  const content = (
    <>
      <div
        className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          danger
            ? 'bg-red-50 dark:bg-red-950/30 text-red-500'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
        )}
      >
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', danger ? 'text-red-500' : 'text-gray-900 dark:text-white')}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{description}</p>
        )}
      </div>
      {comingSoon ? (
        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
          Sắp có
        </span>
      ) : locked ? (
        <Lock
          size={15}
          className="text-gray-300 dark:text-gray-600 flex-shrink-0"
          aria-label={lockedLabel}
          role={lockedLabel ? 'img' : undefined}
        />
      ) : href ? (
        <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
      ) : null}
    </>
  )

  if (comingSoon || !href) {
    return <div className="flex items-center gap-3 px-4 py-3 opacity-60">{content}</div>
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800"
    >
      {content}
    </Link>
  )
}

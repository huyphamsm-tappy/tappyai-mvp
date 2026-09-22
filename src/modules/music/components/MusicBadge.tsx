interface MusicBadgeProps {
  label: string
}

export function MusicBadge({ label }: MusicBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
      {label}
    </span>
  )
}

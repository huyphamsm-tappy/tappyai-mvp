import { X } from 'lucide-react'

interface MusicPickerHeaderProps {
  title: string
  onClose: () => void
}

export function MusicPickerHeader({ title, onClose }: MusicPickerHeaderProps) {
  return (
    <div className="flex items-center px-4 pb-3 flex-shrink-0">
      <h2 className="flex-1 font-semibold text-gray-900 dark:text-white">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <X size={20} />
      </button>
    </div>
  )
}

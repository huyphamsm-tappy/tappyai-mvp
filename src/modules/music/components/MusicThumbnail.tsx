import Image from 'next/image'
import { Music2 } from 'lucide-react'

interface MusicThumbnailProps {
  coverUrl: string | null
  title: string
  size?: number
}

export function MusicThumbnail({ coverUrl, title, size = 40 }: MusicThumbnailProps) {
  if (!coverUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-800 flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Music2 size={size * 0.5} className="text-gray-400" />
      </div>
    )
  }

  return (
    <Image
      src={coverUrl}
      alt={title}
      width={size}
      height={size}
      className="rounded-md object-cover flex-shrink-0"
    />
  )
}

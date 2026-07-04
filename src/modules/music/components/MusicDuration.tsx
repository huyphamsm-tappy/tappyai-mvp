import { formatDuration } from '../utils/formatDuration'

interface MusicDurationProps {
  seconds: number
  className?: string
}

export function MusicDuration({ seconds, className }: MusicDurationProps) {
  return <span className={className}>{formatDuration(seconds)}</span>
}

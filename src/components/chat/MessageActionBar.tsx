'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import posthog from 'posthog-js'
import {
  Copy, Share2, ThumbsUp, ThumbsDown, Volume2,
  RefreshCw, MoreHorizontal, Play, Pause,
  X, Check, FileText, Hash, Flag
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  msgId: string
  messageIndex: number
  conversationId?: string
  text: string          // msg content (CTA block stripped, markdown still present)
  isThisSpeaking: boolean
  isPaused: boolean
  ttsElapsed: number
  ttsTotal: number
  ttsSpeed: number
  onSpeak: () => void
  onTTSPause: () => void
  onTTSSkipBack: () => void
  onTTSSkipForward: () => void
  onTTSSpeedChange: (speed: number) => void
  onTTSStop: () => void
  onRegenerate: () => void
}

const SPEED_OPTIONS = [1, 1.5, 2]

function stripMd(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MessageActionBar({
  msgId, messageIndex, conversationId, text,
  isThisSpeaking, isPaused, ttsElapsed, ttsTotal, ttsSpeed,
  onSpeak, onTTSPause, onTTSSkipBack, onTTSSkipForward, onTTSSpeedChange, onTTSStop,
  onRegenerate,
}: Props) {
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [idCopyState, setIdCopyState] = useState<'idle' | 'copied'>('idle')
  const [showMore, setShowMore] = useState(false)
  const [reportState, setReportState] = useState<'idle' | 'reported'>('idle')
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMore) return
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMore])

  const saveFeedback = useCallback((type: 'like' | 'dislike' | 'report', reason?: string) => {
    if (!conversationId) return
    fetch('/api/message-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messageIndex, type, reason }),
    }).catch(() => {})
  }, [conversationId, messageIndex])

  const deleteFeedback = useCallback((type: 'like' | 'dislike') => {
    if (!conversationId) return
    fetch('/api/message-feedback', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messageIndex, type }),
    }).catch(() => {})
  }, [conversationId, messageIndex])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stripMd(text))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
      posthog.capture('message_action', { action: 'copy' })
    } catch {}
  }

  const handleShare = async () => {
    const plain = stripMd(text)
    posthog.capture('message_action', { action: 'share' })
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text: plain, title: 'TappyAI' }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(plain)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {}
  }

  const handleLike = () => {
    if (liked) {
      setLiked(false)
      deleteFeedback('like')
      posthog.capture('message_action', { action: 'unlike' })
    } else {
      setLiked(true)
      if (disliked) { setDisliked(false); deleteFeedback('dislike') }
      saveFeedback('like')
      posthog.capture('message_action', { action: 'like' })
    }
  }

  const handleDislike = () => {
    if (disliked) {
      setDisliked(false)
      deleteFeedback('dislike')
      posthog.capture('message_action', { action: 'undislike' })
    } else {
      setDisliked(true)
      if (liked) { setLiked(false); deleteFeedback('like') }
      saveFeedback('dislike')
      posthog.capture('message_action', { action: 'dislike' })
    }
  }

  const handleCopyPlaintext = async () => {
    try { await navigator.clipboard.writeText(stripMd(text)) } catch {}
    setShowMore(false)
  }

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(msgId)
      setIdCopyState('copied')
      setTimeout(() => setIdCopyState('idle'), 2000)
    } catch {}
    setShowMore(false)
  }

  const handleReport = () => {
    saveFeedback('report', 'user_reported')
    setReportState('reported')
    setShowMore(false)
    posthog.capture('message_action', { action: 'report' })
  }

  const btnBase = 'p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'

  return (
    <div className="mt-1.5">
      {/* Action row */}
      <div className="flex items-center gap-0.5">
        {/* Copy */}
        <button onClick={handleCopy} className={btnBase} title="Sao chép">
          {copyState === 'copied'
            ? <Check size={14} className="text-green-500" />
            : <Copy size={14} />}
        </button>

        {/* Share */}
        <button onClick={handleShare} className={btnBase} title="Chia sẻ">
          <Share2 size={14} />
        </button>

        {/* Like */}
        <button
          onClick={handleLike}
          className={cn(btnBase, liked && 'text-green-500 bg-green-50 dark:bg-green-900/20 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30')}
          title="Hữu ích"
        >
          <ThumbsUp size={14} />
        </button>

        {/* Dislike */}
        <button
          onClick={handleDislike}
          className={cn(btnBase, disliked && 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30')}
          title="Không hữu ích"
        >
          <ThumbsDown size={14} />
        </button>

        {/* TTS Speaker */}
        <button
          onClick={() => { if (!isThisSpeaking) posthog.capture('message_action', { action: 'tts_played' }); onSpeak() }}
          className={cn(btnBase, isThisSpeaking && 'text-primary-500 bg-primary-50 dark:bg-primary-900/20 hover:text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30')}
          title={isThisSpeaking ? 'Dừng đọc' : 'Đọc to'}
        >
          <Volume2 size={14} />
        </button>

        {/* Regenerate */}
        <button onClick={() => { posthog.capture('message_action', { action: 'regenerate' }); onRegenerate() }} className={btnBase} title="Tạo lại">
          <RefreshCw size={14} />
        </button>

        {/* More menu */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setShowMore(v => !v)}
            className={cn(btnBase, showMore && 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800')}
            title="Thêm"
          >
            <MoreHorizontal size={14} />
          </button>
          {showMore && (
            <div className="absolute bottom-8 right-0 z-50 w-44 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/60 dark:shadow-black/40 overflow-hidden">
              <button
                onClick={handleCopyPlaintext}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors"
              >
                <FileText size={13} className="flex-shrink-0 text-gray-400" />
                Copy Plaintext
              </button>
              <button
                onClick={handleCopyId}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2.5 transition-colors"
              >
                <Hash size={13} className="flex-shrink-0 text-gray-400" />
                {idCopyState === 'copied' ? 'Đã sao chép!' : 'Copy ID'}
              </button>
              <div className="border-t border-gray-100 dark:border-gray-800" />
              <button
                onClick={handleReport}
                disabled={reportState === 'reported'}
                className="w-full text-left px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2.5 transition-colors disabled:opacity-60"
              >
                <Flag size={13} className="flex-shrink-0" />
                {reportState === 'reported' ? 'Đã báo cáo' : 'Báo cáo lỗi'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audio player bar — visible only when this message is speaking */}
      {isThisSpeaking && (
        <div className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          {/* Play / Pause */}
          <button
            onClick={onTTSPause}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
          </button>

          {/* Skip back 15s */}
          <button
            onClick={onTTSSkipBack}
            className="text-xs font-semibold px-1 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 tabular-nums leading-none"
            title="Quay lại 15s"
          >
            «15
          </button>

          {/* Skip forward 15s */}
          <button
            onClick={onTTSSkipForward}
            className="text-xs font-semibold px-1 py-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 tabular-nums leading-none"
            title="Tiến 15s"
          >
            15»
          </button>

          {/* Elapsed time */}
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0 min-w-[32px]">
            {fmtTime(ttsElapsed)}
          </span>

          {/* Progress bar */}
          <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mx-0.5">
            <div
              className="h-full bg-primary-500 transition-all duration-700"
              style={{ width: ttsTotal > 0 ? `${Math.min(100, (ttsElapsed / ttsTotal) * 100)}%` : '0%' }}
            />
          </div>

          {/* Speed toggle */}
          <button
            onClick={() => {
              const idx = SPEED_OPTIONS.indexOf(ttsSpeed)
              onTTSSpeedChange(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length])
            }}
            className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0 min-w-[28px] text-center tabular-nums"
          >
            {ttsSpeed}x
          </button>

          {/* Close / stop TTS */}
          <button
            onClick={onTTSStop}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

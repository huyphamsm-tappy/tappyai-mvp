'use client'

import { useState, useRef, type FormEvent } from 'react'
import { PenLine, Copy, Check, Loader2, Hash, RefreshCw } from 'lucide-react'
import posthog from 'posthog-js'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', emoji: '📘' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
] as const

// Tone/length labels are i18n keys resolved with t() at render time.
const TONES = [
  { id: 'funny', labelKey: 'vietContent.toneFunny' },
  { id: 'emotional', labelKey: 'vietContent.toneEmotional' },
  { id: 'youthful', labelKey: 'vietContent.toneYouthful' },
  { id: 'inspiring', labelKey: 'vietContent.toneInspiring' },
  { id: 'professional', labelKey: 'vietContent.toneProfessional' },
] as const

const LENGTHS = [
  { id: 'short', labelKey: 'vietContent.lengthShort', hintKey: 'vietContent.lengthShortHint' },
  { id: 'medium', labelKey: 'vietContent.lengthMedium', hintKey: 'vietContent.lengthMediumHint' },
  { id: 'long', labelKey: 'vietContent.lengthLong', hintKey: 'vietContent.lengthLongHint' },
] as const

type Platform = (typeof PLATFORMS)[number]['id']
type Tone = (typeof TONES)[number]['id']
type Length = (typeof LENGTHS)[number]['id']

interface Result {
  caption: string
  hashtags: string
}

export default function VietContentForm() {
  const { t } = useTranslation()
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState<Platform>('facebook')
  const [tone, setTone] = useState<Tone>('youthful')
  const [length, setLength] = useState<Length>('medium')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [copiedCaption, setCopiedCaption] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!topic.trim() || loading) return

    posthog.capture('viet_content_used', { platform, tone, length })
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/viet-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), platform, tone, length }),
      })
      const data = await res.json() as { caption?: string; hashtags?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? t('vietContent.errorGeneric'))
        return
      }
      setResult({ caption: data.caption ?? '', hashtags: data.hashtags ?? '' })
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch {
      setError(t('vietContent.errorNetwork'))
    } finally {
      setLoading(false)
    }
  }

  const copy = async (text: string, type: 'caption' | 'all') => {
    await navigator.clipboard.writeText(text)
    if (type === 'caption') {
      setCopiedCaption(true)
      setTimeout(() => setCopiedCaption(false), 2000)
    } else {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Topic */}
        <div className="card p-5 space-y-3">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <PenLine size={15} className="text-primary-500" />
            {t('vietContent.topicLabel')} <span className="text-red-400">*</span>
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('vietContent.topicPlaceholder')}
            rows={3}
            maxLength={500}
            required
            className="w-full rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/50 leading-relaxed"
          />
          <p className="text-xs text-gray-400 text-right">{topic.length}/500</p>
        </div>

        {/* Platform */}
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('vietContent.platformLabel')}</p>
          <div className="grid grid-cols-3 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 text-sm font-medium transition-all',
                  platform === p.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                    : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                )}
              >
                <span className="text-xl">{p.emoji}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('vietContent.toneLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tn) => (
              <button
                key={tn.id}
                type="button"
                onClick={() => setTone(tn.id)}
                className={cn(
                  'px-4 py-2 rounded-full border-2 text-sm font-medium transition-all',
                  tone === tn.id
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
                    : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                )}
              >
                {t(tn.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Length */}
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('vietContent.lengthLabel')}</p>
          <div className="grid grid-cols-3 gap-2">
            {LENGTHS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLength(l.id)}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-3 rounded-2xl border-2 text-sm font-medium transition-all',
                  length === l.id
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                    : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                )}
              >
                <span>{t(l.labelKey)}</span>
                <span className="text-xs opacity-60 font-normal">{t(l.hintKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {t('vietContent.generating')}
            </>
          ) : (
            <>
              <PenLine size={18} />
              {t('vietContent.generateButton')}
            </>
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div ref={resultRef} className="space-y-3 animate-fade-in">
          {/* Caption card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {PLATFORMS.find((p) => p.id === platform)?.emoji}
                </span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{t('vietContent.resultTitle')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {PLATFORMS.find((p) => p.id === platform)?.label} · {t(TONES.find((tn) => tn.id === tone)?.labelKey ?? '')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => copy(result.caption, 'caption')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 transition-all"
              >
                {copiedCaption ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                {copiedCaption ? t('vietContent.copied') : t('vietContent.copy')}
              </button>
            </div>

            <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
              {result.caption}
            </p>
          </div>

          {/* Hashtags card */}
          {result.hashtags && (
            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <Hash size={13} />
                {t('vietContent.hashtagsTitle')}
              </div>
              <p className="text-sm text-primary-600 dark:text-primary-400 leading-relaxed break-words">
                {result.hashtags}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                copy(`${result.caption}\n\n${result.hashtags}`, 'all')
              }
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-primary-500 text-primary-600 dark:text-primary-400 text-sm font-medium hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
            >
              {copiedAll ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
              {copiedAll ? t('vietContent.copiedAll') : t('vietContent.copyAll')}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:border-gray-300 dark:hover:border-gray-600 transition-all"
            >
              <RefreshCw size={15} />
              {t('vietContent.rewrite')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

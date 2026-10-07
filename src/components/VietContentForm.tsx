'use client'

import { useState, useRef, type FormEvent, type ReactNode } from 'react'
import {
  PenLine, Copy, Check, Loader2, Hash, RefreshCw, Lightbulb, ChevronRight, Layers, Wand2,
  FileText, Smile, Heart, Zap, Leaf, Briefcase, List, Sparkles, ArrowRight, type LucideIcon,
} from 'lucide-react'
import posthog from 'posthog-js'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'

/**
 * Instagram has no file under public/brands (Facebook and TikTok do), so its mark is drawn inline:
 * the gradient rounded square + camera glyph. No remote image.
 */
export function InstagramMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden data-brand="instagram">
      <defs>
        <radialGradient id="vc-ig-grad" cx="0.3" cy="1.05" r="1.2">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.3" stopColor="#FA7E1E" />
          <stop offset="0.55" stopColor="#D62976" />
          <stop offset="0.8" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#vc-ig-grad)" />
      <rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3.2" />
      <circle cx="24" cy="24" r="6.3" fill="none" stroke="#fff" strokeWidth="3.2" />
      <circle cx="31.6" cy="16.4" r="2" fill="#fff" />
    </svg>
  )
}

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
] as const

/** Real brand marks: Facebook/TikTok from public/brands/share, Instagram inline (see above). */
function BrandLogo({ id }: { id: (typeof PLATFORMS)[number]['id'] }) {
  if (id === 'instagram') return <InstagramMark className="block h-full w-full" />
  // eslint-disable-next-line @next/next/no-img-element -- static brand SVG from /public
  return <img src={`/brands/share/${id}.svg`} alt="" aria-hidden className="block h-full w-full rounded-xl" data-brand={id} />
}

// Tone/length labels are i18n keys resolved with t() at render time.
const TONES = [
  { id: 'funny', labelKey: 'vietContent.toneFunny', icon: Smile, iconClass: 'text-amber-400' },
  { id: 'emotional', labelKey: 'vietContent.toneEmotional', icon: Heart, iconClass: 'text-rose-500' },
  { id: 'youthful', labelKey: 'vietContent.toneYouthful', icon: Zap, iconClass: 'text-accent-500' },
  { id: 'inspiring', labelKey: 'vietContent.toneInspiring', icon: Leaf, iconClass: 'text-emerald-500' },
  { id: 'professional', labelKey: 'vietContent.toneProfessional', icon: Briefcase, iconClass: 'text-violet-400' },
] as const

// The hints describe what the API actually asks the model for (LENGTH_GUIDE in
// /api/viet-content: 1–2 / 3–5 / 6–10 sentences), not the design's character counts.
const LENGTHS = [
  { id: 'short', labelKey: 'vietContent.lengthShort', hintKey: 'vietContent.lengthShortHint' },
  { id: 'medium', labelKey: 'vietContent.lengthMedium', hintKey: 'vietContent.lengthMediumHint' },
  { id: 'long', labelKey: 'vietContent.lengthLong', hintKey: 'vietContent.lengthLongHint' },
] as const

/** Client-side topic ideas for "Thử gợi ý" — cycled in order; nothing is fetched. */
export const EXAMPLE_TOPIC_KEYS = [
  'vietContent.example1',
  'vietContent.example2',
  'vietContent.example3',
  'vietContent.example4',
  'vietContent.example5',
] as const

type Platform = (typeof PLATFORMS)[number]['id']
type Tone = (typeof TONES)[number]['id']
type Length = (typeof LENGTHS)[number]['id']

interface Result {
  caption: string
  hashtags: string
}

function SectionCard({
  icon: Icon, title, titleFor, hint, required, action, children, id,
}: {
  icon: LucideIcon
  title: string
  titleFor?: string
  hint?: string
  required?: boolean
  action?: ReactNode
  children: ReactNode
  id: string
}) {
  const heading = (
    <>
      <Icon size={20} className="text-primary-500 dark:text-primary-400" aria-hidden />
      {title}
      {required && <span className="text-red-400" aria-hidden>*</span>}
    </>
  )
  const headingClass = 'flex items-center gap-2 text-[15px] font-semibold text-gray-900 dark:text-white'
  return (
    <section className="card p-4 sm:p-5 space-y-3" data-vc-section={id} aria-labelledby={`vc-${id}-title`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {titleFor
          ? <label id={`vc-${id}-title`} htmlFor={titleFor} className={headingClass}>{heading}</label>
          : <h2 id={`vc-${id}-title`} className={headingClass}>{heading}</h2>}
        {hint && <p className="ml-auto text-xs text-content-secondary">{hint}</p>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function SelectedCheck() {
  return (
    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white" aria-hidden data-vc-check>
      <Check size={13} strokeWidth={3} />
    </span>
  )
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
  const [exampleIdx, setExampleIdx] = useState(0)
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
      const data = await res.json() as { caption?: string; hashtags?: string; error?: string; message?: string }

      if (!res.ok || data.error) {
        setError(data.message ?? data.error ?? t('vietContent.errorGeneric'))
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

  const fillExample = () => {
    setTopic(t(EXAMPLE_TOPIC_KEYS[exampleIdx % EXAMPLE_TOPIC_KEYS.length]).slice(0, 500))
    setExampleIdx((i) => (i + 1) % EXAMPLE_TOPIC_KEYS.length)
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Topic */}
        <SectionCard
          id="topic"
          icon={PenLine}
          title={t('vietContent.topicLabel')}
          titleFor="vc-topic"
          required
          action={
            <button
              type="button"
              onClick={fillExample}
              data-vc-try-example
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-50 dark:bg-white/5 px-3 py-1.5 text-sm font-medium text-accent-700 dark:text-accent-300 hover:bg-accent-100 dark:hover:bg-white/10 transition-colors"
            >
              <Lightbulb size={16} aria-hidden />
              {t('vietContent.tryExample')}
              <ChevronRight size={15} aria-hidden />
            </button>
          }
        >
          <textarea
            id="vc-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('vietContent.topicPlaceholder')}
            rows={3}
            maxLength={500}
            required
            className="w-full rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/50 leading-relaxed"
          />
          <p className="text-xs text-content-secondary text-right" data-vc-counter>{topic.length}/500</p>
        </SectionCard>

        {/* Platform */}
        <SectionCard id="platform" icon={Layers} title={t('vietContent.platformLabel')} hint={t('vietContent.platformHint')}>
          <div className="grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-labelledby="vc-platform-title">
            {PLATFORMS.map((p) => {
              const selected = platform === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  aria-pressed={selected}
                  data-vc-platform={p.id}
                  className={cn(
                    'relative flex flex-col items-center gap-2 py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all',
                    selected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/25 text-gray-900 dark:text-white'
                      : 'border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:border-gray-200 dark:hover:border-gray-700',
                  )}
                >
                  {selected && <SelectedCheck />}
                  <span className="h-10 w-10"><BrandLogo id={p.id} /></span>
                  <span>{p.label}</span>
                </button>
              )
            })}
          </div>
        </SectionCard>

        {/* Tone */}
        <SectionCard id="tone" icon={Wand2} title={t('vietContent.toneLabel')} hint={t('vietContent.toneHint')}>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="vc-tone-title">
            {TONES.map((tn) => {
              const selected = tone === tn.id
              const Icon = tn.icon
              return (
                <button
                  key={tn.id}
                  type="button"
                  onClick={() => setTone(tn.id)}
                  aria-pressed={selected}
                  data-vc-tone={tn.id}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 text-sm font-medium transition-all',
                    selected
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600',
                  )}
                >
                  <Icon size={16} className={tn.iconClass} aria-hidden />
                  {t(tn.labelKey)}
                </button>
              )
            })}
          </div>
        </SectionCard>

        {/* Length */}
        <SectionCard id="length" icon={FileText} title={t('vietContent.lengthLabel')} hint={t('vietContent.lengthHint')}>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 sm:gap-3" role="group" aria-labelledby="vc-length-title">
            {LENGTHS.map((l) => {
              const selected = length === l.id
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLength(l.id)}
                  aria-pressed={selected}
                  data-vc-length={l.id}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 text-left transition-all',
                    selected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/25'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700',
                  )}
                >
                  {selected && <SelectedCheck />}
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/5 text-primary-500 dark:text-primary-300">
                    <List size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 pr-5">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">{t(l.labelKey)}</span>
                    <span className={cn('block text-xs', selected ? 'text-primary-600 dark:text-primary-300' : 'text-content-secondary')}>{t(l.hintKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <button
          type="submit"
          disabled={loading || !topic.trim()}
          data-vc-submit
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary-500 via-indigo-500 to-violet-500 py-3.5 px-6 text-base font-semibold text-white shadow-lg shadow-primary-500/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {t('vietContent.generating')}
            </>
          ) : (
            <>
              <Sparkles size={18} aria-hidden />
              {t('vietContent.generateButton')}
              <ArrowRight size={18} aria-hidden />
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
                <span className="h-7 w-7 flex-shrink-0"><BrandLogo id={platform} /></span>
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
              <div className="flex items-center gap-2 text-xs font-semibold text-content-secondary uppercase tracking-wide">
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

'use client'

import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'

// ── P4-12 · The discovery/tool → Chat bridge (DD-004) ──────────────────────
//
// Discovery and the tools used to dead-end. A user who found a place in Explore, or finished a
// split-bill calculation, had no way to carry it into the assistant — they had to retype it. One
// affordance turns every one of those surfaces into a door to the core loop, without a new screen.
//
// IMPACT CLASS B, deliberately. It reuses `/chat?q=` — the same mechanism the Home search bar and
// the Home suggestion cards already use — so no new backend contract, no new context parameter and
// no new infrastructure was introduced to make this work.
//
// 🚨 IT CARRIES A REFERENCE, NOT AN INTENT. The prompt names the entity and asks about it; it does
// not decide what the user wants ("should I buy this?", "book this for me"). Putting words in the
// user's mouth would be a fabrication in the one place the product can least afford one — the
// message that appears as if THEY typed it. The template lives in the dictionary so it stays a
// neutral question in both locales.

export interface AskTappyButtonProps {
  /** The entity being asked about — a place, a deal, a tool result. */
  subject: string
  /**
   * Which phrasing to use.
   *   `entity` → "Tell me more about {subject}"   (Explore, Deals)
   *   `result` → "About this result: {subject}"   (tool output)
   */
  kind?: 'entity' | 'result'
  /** Chat category, so the turn opens in the right context. Optional. */
  category?: string
  className?: string
  variant?: 'chip' | 'block'
}

export default function AskTappyButton({
  subject,
  kind = 'entity',
  category,
  className,
  variant = 'chip',
}: AskTappyButtonProps) {
  const router = useRouter()
  const { t } = useTranslation()

  const label = kind === 'result' ? t('bridge.continueInChat') : t('bridge.askAboutThis')
  const prompt = kind === 'result'
    ? t('bridge.promptResult', { subject })
    : t('bridge.promptEntity', { subject })

  function go(e: React.MouseEvent) {
    // These buttons frequently sit inside a card that is itself a link. Stop both so the bridge
    // never races the card's own navigation.
    e.preventDefault()
    e.stopPropagation()
    const q = encodeURIComponent(prompt)
    router.push(category ? `/chat?q=${q}&category=${encodeURIComponent(category)}` : `/chat?q=${q}`)
  }

  return (
    <button
      type="button"
      onClick={go}
      data-testid="ask-tappy"
      aria-label={label}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl text-sm font-medium transition-colors',
        variant === 'chip'
          ? 'border border-primary-200 px-3 py-1.5 text-primary-600 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-400 dark:hover:bg-primary-900/20'
          : 'w-full justify-center bg-interactive px-4 py-2 text-white hover:bg-interactive-hover',
        className,
      )}
    >
      <MessageCircle size={15} aria-hidden="true" />
      {label}
    </button>
  )
}

'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ── V3 Web · Panel ──────────────────────────────────────────────────────────
//
// The single card shape the V3 surface is built from. Every region of the Home
// grid — the assistant, Explore, Deals, Scam Shield, Tools, Profile — is one of
// these, which is what lets a dense page still read as one product rather than a
// pile of unrelated widgets.
//
// The header is deliberately rigid: tinted glyph, uppercase title, optional
// "see all" on the right. Uniform headers are what make scanning a twelve-panel
// page possible at all, so this is a place where consistency beats expression.

export interface PanelProps {
  title: string
  /** Tint for the glyph tile. Identifies the panel at a glance; never the only signal. */
  tone?: 'accent' | 'violet' | 'amber' | 'emerald' | 'rose'
  icon?: ReactNode
  /** Optional right-hand link. */
  action?: { label: string; href: string }
  className?: string
  bodyClassName?: string
  children: ReactNode
}

const TONE: Record<NonNullable<PanelProps['tone']>, { bg: string; fg: string }> = {
  accent: { bg: 'rgba(51,145,255,0.16)', fg: '#3391FF' },
  violet: { bg: 'rgba(139,92,246,0.16)', fg: '#A78BFA' },
  amber: { bg: 'rgba(245,158,11,0.16)', fg: '#FBBF24' },
  emerald: { bg: 'rgba(52,211,153,0.16)', fg: '#34D399' },
  rose: { bg: 'rgba(251,113,133,0.16)', fg: '#FB7185' },
}

export default function Panel({
  title,
  tone = 'accent',
  icon,
  action,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const t = TONE[tone]
  return (
    <section className={cn('v3-panel flex flex-col', className)}>
      <header className="v3-panel-header">
        <span className="v3-panel-icon" style={{ background: t.bg, color: t.fg }} aria-hidden="true">
          {icon}
        </span>
        <h2 className="v3-panel-title">{title}</h2>
        {action && (
          <Link href={action.href} className="v3-seeall hover:underline">
            {action.label}
          </Link>
        )}
      </header>
      <div className={cn('p-4 flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  )
}

/** A horizontally scrollable row of filter chips. */
export function ChipRow({
  items,
  activeIndex = 0,
  onSelect,
  className,
}: {
  items: string[]
  activeIndex?: number
  onSelect?: (i: number) => void
  className?: string
}) {
  return (
    <div className={cn('v3-scroll-x flex gap-2', className)}>
      {items.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect?.(i)}
          aria-pressed={i === activeIndex}
          className={cn('v3-chip flex-shrink-0', i === activeIndex && 'v3-chip-active')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

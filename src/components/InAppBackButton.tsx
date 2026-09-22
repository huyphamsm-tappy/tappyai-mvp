'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { goBack } from '@/lib/nav/inAppBack'

/**
 * A Back control for pages that draw their own top bar (no `Header`).
 *
 * Replaces `<Link href="/">` glyphs that sent every Back to Home no matter where
 * the person came from (Phase 7: Smart Tools → tool → Back landed on Home). Pops
 * in-app history when there is some; otherwise `replace()`s `fallbackHref`, the
 * page's declared parent. Presentation is the caller's — this only decides where
 * Back goes.
 */
export default function InAppBackButton({
  fallbackHref,
  className,
  style,
  'aria-label': ariaLabel,
  children,
}: {
  fallbackHref: string
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => goBack(router, fallbackHref)}
      className={className}
      style={style}
      aria-label={ariaLabel}
      data-in-app-back={fallbackHref}
    >
      {children}
    </button>
  )
}

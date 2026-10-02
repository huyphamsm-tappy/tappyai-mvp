import type { CSSProperties } from 'react'

// ── The TappyAI lockup, as the product already ships it ─────────────────────
//
// 🚨 ONE MARK, ONE WORDMARK. This is the sidebar/Header lockup lifted verbatim
// (see V3Shell.tsx: "The mark is the SHIPPED brand asset, not a lucide glyph"):
//
//   · the mark is `/branding/otter-logo.png` — the app icon, the favicon, the
//     login and onboarding screens — drawn with Header's own `rounded-[22%]
//     object-cover` treatment (the source is a 1254² icon with a white margin;
//     object-cover crops to the blue tile);
//   · the wordmark is the word "Tappy" in white followed by "AI" in the brand
//     blue — never "TAPPY", never a redrawn glyph, never `/logo.svg` (a
//     different, unapproved mark that the brochure used to carry).
//
// Dark surfaces only (the plan brochure, its mini preview, the social card are
// all dark by design), so the colours are literal rather than theme tokens:
// `#FFFFFF` is `--v3-fg` in the dark theme and `#3391FF` is `--v3-accent`.
// Server-safe: a plain <img>, no next/image, so the same component renders in
// a server component and inside the client share menu.

export const TAPPY_MARK_SRC = '/branding/otter-logo.png'
export const TAPPY_WORDMARK_WHITE = '#FFFFFF'
export const TAPPY_WORDMARK_BLUE = '#3391FF'

interface Props {
  /** Mark size in px; the wordmark scales with it. */
  size?: number
  className?: string
  style?: CSSProperties
  /** Hide the wordmark and keep only the mark (a favicon-sized use). */
  markOnly?: boolean
}

export default function TappyLockup({ size = 28, className, style, markOnly = false }: Props) {
  const font = Math.round(size * 0.62)
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.32), lineHeight: 1, ...style }}
      data-tappy-lockup
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the shipped brand asset, fixed box, no pipeline needed */}
      <img
        src={TAPPY_MARK_SRC}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        decoding="async"
        style={{ width: size, height: size, borderRadius: '22%', objectFit: 'cover', flexShrink: 0 }}
        data-tappy-mark
      />
      {!markOnly && <TappyWordmark fontSize={font} />}
    </span>
  )
}

/** "Tappy" white, "AI" brand blue — the exact split the sidebar renders. */
export function TappyWordmark({ fontSize = 16, className }: { fontSize?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ fontSize, fontWeight: 800, letterSpacing: '-0.01em', color: TAPPY_WORDMARK_WHITE, whiteSpace: 'nowrap' }}
      data-tappy-wordmark
    >
      Tappy<span style={{ color: TAPPY_WORDMARK_BLUE }} data-tappy-wordmark-ai>AI</span>
    </span>
  )
}

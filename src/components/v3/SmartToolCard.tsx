'use client'

import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { TappyMascot, type TappyPose } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SmartTool } from '@/lib/tools/registry'

// ── Smart Tool tile — THE one card, on Home and on /tools ───────────────────
//
// 🔑 ONE PRESENTATION FOR ONE REGISTRY. `/tools` and Home's "Công cụ" rail both read
// `src/lib/tools/registry.ts`; before this file they painted it two different ways — the
// redesigned gradient tile on /tools and the old grey `.v3-tile` on Home — so the same tool
// looked like two products depending on where the user met it. This is the tile, with two
// SIZES: `full` is the /tools catalogue card, `compact` is Home's preview rail. Same hue, same
// badge, same type ramp, same chevron, same mascot library, same hover/focus — scaled down.
//
// 🚨 NOT A SECOND LIST. Nothing here knows which tools exist or in what order; it renders the
// `SmartTool` it is handed. Home keeps `homeSmartTools()`, /tools keeps `smartToolGroups()`, and
// the registry stays the only place a tool is declared.
//
// 🔑 THE SKIN IS KEYED BY TOOL ID AND IS PRESENTATION ONLY. `hue` resolves in `globals.css`
// (`.v3-toolcard[data-hue]`, light + dark); `pose` is one of the owner's 18 mascot PNGs through
// `TappyMascot` — mapped, not drawn. A tool without a skin still renders (neutral tile, no
// mascot); a skin without a tool renders nothing.

export type SmartToolSkin = { hue: string; pose?: TappyPose }

export const SMART_TOOL_SKINS: Record<string, SmartToolSkin> = {
  scan: { hue: 'blue', pose: 'searching' },
  translate: { hue: 'indigo', pose: 'speaking' },
  currency: { hue: 'emerald', pose: 'deals' },
  split: { hue: 'amber', pose: 'welcome' },
  safety: { hue: 'blue', pose: 'recommendation' },
  suggest: { hue: 'olive', pose: 'travel' },
  together: { hue: 'rose', pose: 'food' },
  music: { hue: 'cobalt', pose: 'aitools' },
  fortune: { hue: 'violet', pose: 'thinking' },
  captions: { hue: 'pink', pose: 'phone' },
}

export interface SmartToolCardProps {
  tool: SmartTool
  /** `full` = the /tools catalogue tile. `compact` = Home's five-up preview rail. */
  variant?: 'full' | 'compact'
}

/**
 * One tool: identity, purpose, and a way in.
 *
 * 🚨 A LINK, NOT A DIV WITH AN onClick. It is real navigation to a real route, so it is an
 * anchor — keyboard-reachable, focusable and announceable without any extra wiring. The whole
 * tile is the target. The glyph and the mascot are `aria-hidden`; the accessible name is the
 * tool's own label, and the description is read with it rather than being decoration only
 * sighted users get.
 *
 * 🚨 THE SIGN-IN HINT IS TEXT AND AN ICON, NOT A COLOUR. `/group/new` redirects a signed-out
 * visitor to /login, and a card that only dimmed would tell a colour-blind user nothing. The
 * card still navigates — the route's own server-side check decides, exactly as it does today.
 *
 * 🚨 THE COPY NEVER RUNS UNDER THE MASCOT. The mascot is anchored top-right beside the badge,
 * and the badge row is at least as tall as the mascot's box — so the title AND the description
 * start under its feet and run the full width. A right-hand title column was tried first; it
 * fit `scan` and broke on `split` at 218px and on "Currency Converter" at every width.
 *
 *   full    · mascot 88 (xl 100), inset 8 (xl 12), pad 16 (md 20), text gap 20
 *             → row min-h 64 (xl 76), +4 so the title's own line box clears.
 *   compact · mascot 72, inset 6, pad 14, text gap 12, and the mascot only from `sm` —
 *             a two-up 160px phone tile has no room for it → row min-h 56 from `sm`.
 */
export default function SmartToolCard({ tool, variant = 'full' }: SmartToolCardProps) {
  const { t } = useTranslation()
  const Icon = tool.icon
  const skin = SMART_TOOL_SKINS[tool.id]
  const compact = variant === 'compact'

  return (
    <Link
      href={tool.href}
      data-tool={tool.id}
      data-hue={skin?.hue}
      data-variant={variant}
      className={
        compact
          ? 'v3-toolcard group min-h-[128px] p-3.5 sm:min-h-[150px]'
          : 'v3-toolcard group min-h-[180px] p-4 md:min-h-[192px] md:p-5 xl:min-h-[200px]'
      }
    >
      <span className={compact ? 'block sm:min-h-[56px]' : 'block min-h-[64px] xl:min-h-[76px]'}>
        <span
          className={
            compact
              ? 'v3-toolcard-badge flex h-10 w-10 items-center justify-center rounded-xl'
              : 'v3-toolcard-badge flex h-12 w-12 items-center justify-center rounded-[14px] md:h-[52px] md:w-[52px]'
          }
          aria-hidden="true"
        >
          <Icon size={compact ? 18 : 22} strokeWidth={2.25} />
        </span>
      </span>

      {/* Full-width copy under the mascot; only the chevron's corner is kept clear. */}
      <span className={compact ? 'relative z-10 mt-auto block pt-3' : 'relative z-10 mt-auto block pt-5'}>
        <span
          className={
            compact
              ? 'v3-toolcard-title block pr-6 text-[15px] font-bold leading-tight tracking-[-0.01em]'
              : 'v3-toolcard-title block pr-7 text-[18px] font-bold leading-tight tracking-[-0.01em] md:text-[19px] xl:text-[20px]'
          }
        >
          {t(tool.labelKey)}
        </span>
        <span
          className={
            compact
              ? 'v3-toolcard-desc mt-1 block pr-6 text-[12px] leading-snug'
              : 'v3-toolcard-desc mt-1.5 block pr-7 text-[13px] leading-snug md:text-[13.5px] md:leading-snug'
          }
        >
          {t(tool.descKey)}
        </span>
        {tool.auth && (
          <span className={`v3-toolcard-desc inline-flex items-center gap-1 font-medium ${compact ? 'mt-1.5 text-[10.5px]' : 'mt-2 text-[11px]'}`}>
            <Lock size={compact ? 10 : 11} aria-hidden="true" />
            {t('v3.tools.authHint')}
          </span>
        )}
      </span>

      <ChevronRight
        size={compact ? 18 : 20}
        strokeWidth={2.5}
        aria-hidden="true"
        className={
          compact
            ? 'v3-toolcard-chevron absolute bottom-3.5 right-3.5 z-10'
            : 'v3-toolcard-chevron absolute bottom-4 right-4 z-10 md:bottom-5 md:right-5'
        }
      />

      {skin?.pose && (
        <span
          className={
            compact
              ? 'v3-toolcard-mascot absolute right-1.5 top-1.5 hidden sm:block'
              : 'v3-toolcard-mascot absolute right-2 top-2 block xl:right-3 xl:top-3'
          }
          aria-hidden="true"
        >
          {compact ? (
            <TappyMascot pose={skin.pose} size={72} className="h-auto w-[72px]" />
          ) : (
            <TappyMascot pose={skin.pose} size={100} className="h-auto w-[88px] xl:w-[100px]" />
          )}
        </span>
      )}
    </Link>
  )
}

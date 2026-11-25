'use client'

import Link from 'next/link'
import { BANNER_ART, BANNER_HREF, BANNER_SIZE, SHELL_SLOTS } from '@/lib/chat/shellSlots'
import { useTranslation } from '@/lib/i18n/useTranslation'

// The reserved places for the banner and the background (see lib/chat/shellSlots.ts). Each renders nothing unless the slot has a picture or the frame flag is on.

/** Behind the whole workspace: the first child of the root, which is an isolated stacking context, so it sits above the root's own ground and under every panel. */
export function ShellBackgroundSlot() {
  const image = SHELL_SLOTS.background
  if (!image && !SHELL_SLOTS.frame) return null
  return (
    <div data-shell-background aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
      {image && <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url("${image}")` }} />}
      {SHELL_SLOTS.frame && (
        <div className="absolute inset-3 flex items-end justify-end rounded-2xl border-2 border-dashed border-amber-300/50 p-3 text-xs text-amber-200/80">
          Background slot (covers the whole workspace, under every panel)
        </div>
      )}
    </div>
  )
}

/**
 * The banner: a panel of its own at the top of the right column, ABOVE the conversation's panel and level with the top of the history panel (the owner's first layout). It is a
 * fixed-height band the full width of the column; the conversation panel under it is a separate rounded panel. Wide screens only.
 */
export function ShellBannerSlot() {
  const { t } = useTranslation()
  const image = SHELL_SLOTS.banner
  if (!image && !SHELL_SLOTS.frame) return null
  return (
    // WITH a picture the frame takes the column's width and the picture's OWN height (width 100 %, height auto): the picture always fills it edge to edge, whatever its proportions, so no bar can appear
    // at its sides (a box with a fixed ratio and a border letterboxed the owner's art by 12-14 px each side on 15/11). The frame has no border of its own (a border would take 2 px off the picture's box);
    // its edge is the picture's. Without a picture the dashed placeholder keeps the reference proportions.
    <div
      data-shell-banner
      className={image ? 'shell-panel-art hidden max-h-[200px] shrink-0 overflow-hidden rounded-2xl lg:block' : 'shell-panel hidden shrink-0 overflow-hidden rounded-2xl lg:block'}
      style={image ? undefined : { aspectRatio: `${BANNER_SIZE.width} / ${BANNER_SIZE.height}` }}
    >
      {image
        ? (
          // the banner is the Explore banner: one click anywhere on it goes to Khám phá (the rail's own destination); the picture is its label, so the link is named by the destination
          <Link href={BANNER_HREF} aria-label={t('nav.explore')} data-testid="shell-banner-link" className="block transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300">
            {/* eslint-disable-next-line @next/next/no-img-element -- a decorative band; the address is checked by slotImageUrl; width/height only give the browser the ratio before it loads */}
            <img src={image} alt="" width={BANNER_SIZE.width} height={BANNER_SIZE.height} className="block h-auto w-full" />
          </Link>
        )
        : (
          <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-amber-300/50 text-xs text-amber-200/80">
            Banner slot - art {BANNER_ART.width} x {BANNER_ART.height} px
          </div>
        )}
    </div>
  )
}

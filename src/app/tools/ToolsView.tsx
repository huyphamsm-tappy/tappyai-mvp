'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { ChevronRight, LayoutGrid, Lightbulb, Lock } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { TappyMascot, type TappyPose } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { smartToolGroups, type SmartTool } from '@/lib/tools/registry'

// ── V3 Web · Smart Tools (/tools) ───────────────────────────────────────────
//
// 🚨 THE DESTINATION TWO NAV ENTRIES ALREADY CLAIMED TO HAVE. The sidebar's "Smart Tools" row
// and the top tab bar both pointed at `/#smart-tools` — an anchor NO element in the codebase
// carried — so both scrolled to the top of Home and looked like they had worked. This is the
// "Page 7 (Tools)" that `V3Shell`'s KNOWN NAVIGATION DEBT note and `HomeV3`'s tools comment
// both name as the thing that would eventually hold the full set.
//
// 🚨 UTILITIES, NOT A MARKETPLACE. No categories from commerce or travel discovery — the three
// group names here (`v3.tools.daily` / `discover` / `fun`) are the ones the approved Home
// layout authored for these exact tools before Home was cut to one row. No prices, no ratings,
// no usage counts, no badges: the registry carries none of those and none is computed here.
//
// 🚨 EVERY CARD IS A REAL TOOL AT ITS REAL ROUTE. The list comes from `smartTools()` and
// nothing is appended to make a grid look full. If the capability gate removes a tool, the
// card is simply absent and the grid reflows — a shorter shelf is the honest render.
//
// ── The redesign (owner's Smart Tools reference, 2026-09-11) ────────────────
//
// One dark frame with a large in-page header, three labelled groups, and feature TILES rather
// than compact buttons: a tinted gradient per tool, the glyph in a solid badge top-left, a
// large title, the existing description, the mascot on the right and a chevron in the corner.
//
// 🔑 THE REGISTRY IS STILL THE ONLY DATA. Identity, purpose, route, group order and the glyph
// all come from `smartToolGroups()`. What this file adds is a SKIN — a hue and a mascot pose
// keyed by tool id — which is presentation, not a second list: a tool without a skin still
// renders (neutral tile, no mascot), and a skin without a tool renders nothing.
//
// 🔑 THE MASCOT IS THE OWNER'S EXISTING 18-POSE LIBRARY (`/public/tappy/<pose>.png` through
// `TappyMascot`). Poses are MAPPED, not drawn — code's half of the contract in
// `public/tappy/README.md` — and the component's own fallback covers a missing file. It is
// decorative on every tile: `aria-hidden`, `pointer-events: none`, and the copy always starts
// below it, so the two never overlap at any width.

/** Presentation only. `hue` resolves in `globals.css` (`.v3-toolcard[data-hue]`), per theme. */
type ToolSkin = { hue: string; pose?: TappyPose }

const SKINS: Record<string, ToolSkin> = {
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

export default function ToolsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()
  const groups = smartToolGroups()

  return (
    <V3Shell
      title={t('v3.nav.smartTools')}
      activeTab="/tools"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--v3-header-h) - 5.5rem)' }}>
        <div className="v3-tools-frame flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:gap-9 lg:p-8">
          {/* ── Header ──────────────────────────────────────────────────────
              The shell's top bar keeps the quiet page identity every V3 page has; this is the
              page's own, at the size the reference gives it. The title reuses
              `v3.nav.smartTools` so the row, the tab and the page still call one destination
              one thing, and the blurb is the one already authored for it. */}
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] sm:h-16 sm:w-16"
                style={{
                  background: 'linear-gradient(135deg, var(--v3-accent-fill), color-mix(in srgb, var(--v3-accent-fill) 55%, #000))',
                  color: 'var(--v3-on-accent)',
                  boxShadow: '0 10px 24px -10px var(--v3-accent-soft)',
                }}
                aria-hidden="true"
              >
                <LayoutGrid size={28} strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[26px] font-bold leading-none tracking-[-0.02em] sm:text-[30px]" style={{ color: 'var(--v3-fg)' }}>
                  {t('v3.nav.smartTools')}
                </h2>
                <p className="mt-2 text-[13.5px] leading-snug sm:text-[14.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                  {t('v3.tools.blurb')}
                </p>
              </div>
            </div>

            {/* A real destination: Home is the assistant, the one surface that "does more". */}
            <Link
              href="/"
              data-tools-cta
              className="inline-flex max-w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-[13px] font-medium leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{
                borderColor: 'var(--v3-border)',
                backgroundColor: 'var(--v3-panel-elevated)',
                color: 'var(--v3-fg)',
              }}
            >
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--v3-accent-soft)', color: 'var(--v3-amber)' }}
                aria-hidden="true"
              >
                <Lightbulb size={16} />
              </span>
              <span className="max-w-[10.5rem]">{t('v3.tools.cta')}</span>
            </Link>
          </header>

          {/* ── Groups ─────────────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col gap-8 lg:gap-9">
            {groups.map((group) => (
              <section
                key={group.titleKey}
                data-tool-group={group.titleKey}
                // The key is dotted (`v3.tools.daily`), and a dotted id is a class selector to
                // `querySelector`. The last segment is unique across the three groups.
                aria-labelledby={`tool-group-${group.titleKey.split('.').pop()}`}
              >
                <div className="flex items-center gap-4">
                  <h3
                    id={`tool-group-${group.titleKey.split('.').pop()}`}
                    className="text-[12.5px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--v3-fg-muted)' }}
                  >
                    {t(group.titleKey)}
                  </h3>
                  {/* The reference's hairline running off the label — decorative. */}
                  <span className="h-px flex-1" style={{ backgroundColor: 'var(--v3-border)' }} aria-hidden="true" />
                </div>

                {/* 🚨 THE GRID STEPS 1 → 2 → 3 → 4. The compact page was two-up on a phone; these
                    are FEATURE TILES, and two of them inside the frame at 375px measured 125px
                    wide — the `scan` description (`v3.tool.scanDesc`) ran to five lines beside a
                    chevron. One column below `sm` gives a ~260px tile that carries its copy on two
                    lines AND its mascot, which is the redesign rather than a shrunken desktop.
                    Four across on desktop is the reference's row (Everyday's fifth tile starts
                    the next row, as it does there). Nothing sets a width on a card, so nothing
                    overflows the page horizontally at any step. */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 xl:grid-cols-4 xl:gap-5">
                  {group.tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} skin={SKINS[tool.id]} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <V3Footer />
      </div>
    </V3Shell>
  )
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
 * 🚨 THE COPY NEVER RUNS UNDER THE MASCOT. From `md` up the mascot is anchored top-right,
 * beside the badge, and the badge row is at least as tall as the mascot's box — so the title
 * AND the description start under its feet and run the full width. The first cut reserved a
 * right-hand column for the title instead; that fit `scan` and broke on `split` at 218px
 * and on "Currency Converter" at every width. The one-column phone tile is wide enough to keep
 * the mascot, so it renders at every width.
 */
function ToolCard({ tool, skin }: { tool: SmartTool; skin?: ToolSkin }) {
  const { t } = useTranslation()
  const Icon = tool.icon

  return (
    <Link
      href={tool.href}
      data-tool={tool.id}
      data-hue={skin?.hue}
      className="v3-toolcard group min-h-[180px] p-4 md:min-h-[192px] md:p-5 xl:min-h-[200px]"
    >
      {/* The badge row is at least as tall as the mascot's box (mascot inset + height, minus the
          tile padding and the text block's own top gap), so the copy ALWAYS starts under the
          mascot's feet — including on the auth-gated card, whose extra hint line would otherwise
          push it up. base: 8 + 88 − 16 − 20 = 60 · md: 8 + 88 − 20 − 20 = 56 · xl: 12 + 100 −
          20 − 20 = 72, plus 4px so the title's own line box clears too. Measured, not eyeballed. */}
      <span className="block min-h-[64px] xl:min-h-[76px]">
        <span className="v3-toolcard-badge flex h-12 w-12 items-center justify-center rounded-[14px] md:h-[52px] md:w-[52px]" aria-hidden="true">
          <Icon size={22} strokeWidth={2.25} />
        </span>
      </span>

      {/* Full-width copy under the mascot; only the chevron's corner is kept clear. */}
      <span className="relative z-10 mt-auto block pt-5">
        <span className="v3-toolcard-title block pr-7 text-[18px] font-bold leading-tight tracking-[-0.01em] md:text-[19px] xl:text-[20px]">
          {t(tool.labelKey)}
        </span>
        <span className="v3-toolcard-desc mt-1.5 block pr-7 text-[13px] leading-snug md:text-[13.5px] md:leading-snug">
          {t(tool.descKey)}
        </span>
        {tool.auth && (
          <span className="v3-toolcard-desc mt-2 inline-flex items-center gap-1 text-[11px] font-medium">
            <Lock size={11} aria-hidden="true" />
            {t('v3.tools.authHint')}
          </span>
        )}
      </span>

      <ChevronRight
        size={20}
        strokeWidth={2.5}
        aria-hidden="true"
        className="v3-toolcard-chevron absolute bottom-4 right-4 z-10 md:bottom-5 md:right-5"
      />

      {skin?.pose && (
        <span
          className="v3-toolcard-mascot absolute right-2 top-2 block xl:right-3 xl:top-3"
          aria-hidden="true"
        >
          <TappyMascot pose={skin.pose} size={100} className="h-auto w-[88px] xl:w-[100px]" />
        </span>
      )}
    </Link>
  )
}

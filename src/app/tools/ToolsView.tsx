'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { LayoutGrid, Lightbulb } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import SmartToolCard from '@/components/v3/SmartToolCard'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { smartToolGroups } from '@/lib/tools/registry'

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
// all come from `smartToolGroups()`. The tile itself — hue, badge, mascot pose, type ramp — is
// `SmartToolCard` (`src/components/v3/SmartToolCard.tsx`), the SAME component Home's "Công cụ"
// rail renders in its `compact` size, so a tool looks like one product wherever it appears.

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
                    <SmartToolCard key={tool.id} tool={tool} />
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

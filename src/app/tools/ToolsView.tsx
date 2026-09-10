'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { ArrowRight, Lock } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
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

export default function ToolsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()
  const groups = smartToolGroups()

  return (
    <V3Shell
      title={t('v3.nav.smartTools')}
      subtitle={t('v3.tools.blurb')}
      activeTab="/tools"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--v3-header-h) - 5.5rem)' }}>
        <div className="flex flex-1 flex-col gap-7">
          {groups.map((group) => (
            <section
              key={group.titleKey}
              data-tool-group={group.titleKey}
              // The key is dotted (`v3.tools.daily`), and a dotted id is a class selector to
              // `querySelector`. The last segment is unique across the three groups.
              aria-labelledby={`tool-group-${group.titleKey.split('.').pop()}`}
            >
              <h2
                id={`tool-group-${group.titleKey.split('.').pop()}`}
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--v3-fg-muted)' }}
              >
                {t(group.titleKey)}
              </h2>

              {/* 🚨 THE GRID STEPS 2 → 3 → 4, NOT 1 → 5. One row of five on a 1280 desktop leaves
                  ~185px per card, which is not enough for a title and a two-line description; a
                  single column on a phone turns ten tools into a very long page. Two up at 360px
                  keeps the tap target and the description readable, and nothing overflows the
                  page horizontally at any step. */}
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {group.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </section>
          ))}
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
 * anchor — keyboard-reachable, focusable and announceable without any extra wiring. The glyph
 * is `aria-hidden`; the accessible name is the tool's own label, and the description is read
 * with it rather than being decoration only sighted users get.
 *
 * 🚨 THE SIGN-IN HINT IS TEXT AND AN ICON, NOT A COLOUR. `/group/new` redirects a signed-out
 * visitor to /login, and a card that only dimmed would tell a colour-blind user nothing. The
 * card still navigates — the route's own server-side check decides, exactly as it does today.
 */
function ToolCard({ tool }: { tool: SmartTool }) {
  const { t } = useTranslation()
  const Icon = tool.icon

  return (
    <Link
      href={tool.href}
      data-tool={tool.id}
      className="v3-tile group flex min-h-[132px] flex-col gap-2.5 p-4 focus-visible:outline-none focus-visible:ring-2 active:scale-[0.99]"
      style={{ transition: 'transform 120ms ease, border-color 120ms ease' }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: 'rgba(255,255,255,0.055)', color: tool.tone }}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>

      <span className="flex-1">
        <span className="block text-[13px] font-semibold leading-snug" style={{ color: 'var(--v3-fg)' }}>
          {t(tool.labelKey)}
        </span>
        <span className="mt-1 block text-[11.5px] leading-relaxed" style={{ color: 'var(--v3-fg-muted)' }}>
          {t(tool.descKey)}
        </span>
      </span>

      <span className="flex items-center justify-between gap-2">
        {tool.auth ? (
          <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
            <Lock size={10} aria-hidden="true" />
            {t('v3.tools.authHint')}
          </span>
        ) : (
          <span />
        )}
        <ArrowRight
          size={14}
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-0.5"
          style={{ color: 'var(--v3-accent)' }}
        />
      </span>
    </Link>
  )
}

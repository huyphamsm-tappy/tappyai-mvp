'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { navIcon } from './navIcons'
import { toCommands, filterCommands } from '@/lib/controller/commandPalette'
import type { NavGroup } from '@/lib/controller/adminNavigation'

// Controller V2 — Phase 7 / B5: the COMMAND PALETTE (01_ARCH §8).
//
// NAVIGATE ONLY. §8 names three capabilities — "navigate · act · search" — and
// defines exactly one of them: "Derived from the Module Registry, filtered by
// the actor's permissions. You never see a door you cannot open."
//
// `act` and `search` are named and never specified. No authoritative source
// lists a single command, its permission, its confirmation or its audit; none
// names a searchable entity, field, ranking or scope. Neither is built here — a
// palette that executes an admin mutation nobody specified is the worst possible
// place to guess, and a search box that reaches data with no defined scope is
// the second worst.
//
// The text box narrows THIS list. It is not the `search` capability: it touches
// no data and can only ever return a subset of what the server authorized.
//
// SECURITY: the palette consumes `navGroups` — already filtered by the PDP and
// the hub permissionScope on the server. It re-derives no permission and cannot
// widen the list. Built on the existing Dialog primitive; no new dependency.

export function CommandPalette({ navGroups }: { navGroups: readonly NavGroup[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const commands = useMemo(() => toCommands(navGroups), [navGroups])
  const visible = useMemo(() => filterCommands(commands, query, t), [commands, query, t])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // §8 names ⌘K. Ctrl+K is included because there is no ⌘ key on Windows or
      // Linux, where the named shortcut would otherwise be unreachable — the same
      // shortcut, on the platform in use, not a second one.
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // A stale query would silently narrow the next opening.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <>
      {/* Discoverable without the shortcut: a keyboard-only affordance is
          invisible to anyone who has not been told about it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden md:flex items-center gap-2 rounded-admin-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        {t('admin.palette.open')}
        <kbd className="ml-1 font-mono text-[10px] opacity-70">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="admin-theme max-w-lg p-0">
          <DialogTitle className="sr-only">{t('admin.palette.title')}</DialogTitle>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.palette.placeholder')}
              aria-label={t('admin.palette.title')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {visible.length === 0 ? (
            // UI standards §10: a meaningful empty state, never a silent void.
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('admin.palette.noResults')}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-2">
              {visible.map((c) => {
                const Icon = navIcon(c.icon)
                return (
                  <li key={c.route}>
                    {/* A real link: reachable by Tab (UI standards §8), and it
                        behaves like navigation because that is what it is. */}
                    <Link
                      href={c.route}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-admin-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:bg-muted"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="flex-1 truncate">{t(c.labelKey)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t(c.hubLabelKey)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

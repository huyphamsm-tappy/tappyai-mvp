'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { ControllerEnv } from '@/lib/controller/adminConfig'

// Controller V2 — Phase 7 / B5: the CONTEXT BAR.
//
// 01_ARCH §8 names it "env · date range · locale"; UI standards §2 states the
// requirement it serves — "Context is always visible … always in view".
//
// PARTIAL, and deliberately so. `env` and `locale` are fully specified. The DATE
// RANGE is not: §5.4 defines the picker's presets and its "Last 30 days"
// default, and ADR-008 fixes the reporting timezone, but no authoritative source
// says WHAT the range filters — not whether it reaches audit, the Home signals,
// or the Alert Well, and not what it means on a page with no time series at all.
// A control that looks like a filter and filters nothing is worse than an absent
// one, so it is not built here. The gap is recorded in STATUS.md.
//
// Presentation only: it renders context, it never decides access.

/** Env label keys live under `admin.home.*` because the Home used them first.
 *  Reused rather than duplicated — two copies of a user-facing string drift. */
const ENV_LABEL: Record<ControllerEnv, string> = {
  production: 'admin.home.env.production',
  preview: 'admin.home.env.preview',
  local: 'admin.home.env.local',
}

export function ContextBar({ env }: { env: ControllerEnv }) {
  const { t, locale, setLocale } = useTranslation()

  return (
    <div className="flex items-center gap-3">
      {/* The label is what carries the meaning; production is not distinguished
          from preview by colour alone (UI standards §8). */}
      <Badge variant="muted" aria-label={t('admin.context.envLabel')}>
        {t(ENV_LABEL[env])}
      </Badge>

      <div className="flex gap-1">
        {(['vi', 'en'] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              locale === code ? 'bg-interactive text-white' : 'text-muted-foreground hover:bg-muted'
            )}
            aria-pressed={locale === code}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

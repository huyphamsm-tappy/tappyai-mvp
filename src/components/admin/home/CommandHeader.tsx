'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Badge } from '@/components/ui/badge'
import type { ControllerHomeData } from './types'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'admin.role.superAdmin',
  admin: 'admin.role.admin',
  moderator: 'admin.role.moderator',
  analyst: 'admin.role.analyst',
}

// Controller V2 — command-center header. Brand anchor (Tappy otter) + the
// product identity + the actor's DERIVED context + role + environment. No
// fabricated data.
//
// Corrected 2026-08-23: this comment used to end "The scope selector offers only
// authorized departments." There is no selector — Owner decision 2026-08-21
// removed it, and D12 records that in SSOT.
//
// 🔑 CONTEXT IS DERIVED, NEVER CHOSEN (Owner Decision D11, V2.1). `mode` and
// `departments` are resolved server-side by `homeMode()` from membership. This
// header READS them. It offers no control, and none may be added: D12 removed
// the switcher precisely because nothing defines what selecting would do.
export function CommandHeader({ data }: { data: ControllerHomeData }) {
  const { t } = useTranslation()
  const roleLabel = data.actor.isOwner ? t('admin.role.owner') : t(ROLE_LABEL[data.actor.role] ?? 'admin.role.analyst')

  // WHERE the actor is, in their own words. Owner → the enterprise; a member →
  // the department(s) their membership actually covers.
  //
  // 🔑 EVERY department is named, never just the first. Picking `departments[0]`
  // as "the" department would invent a primary the data does not have — the
  // exact invention D11 forbids for the multi-membership case.
  const scopeLabel =
    data.mode === 'owner'
      ? t('admin.home.command.allDepartments')
      : data.mode === 'department'
        ? data.departments.map((d) => t(d.nameKey)).join(' · ')
        : null

  // The framing that goes with it. `none` gets neither: an actor with no
  // workspace must not be told they have one.
  const scopeKind =
    data.mode === 'owner'
      ? t('admin.home.grid.enterprise')
      : data.mode === 'department'
        ? t('admin.home.grid.workspace')
        : null

  return (
    <header className="rounded-admin-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image src="/branding/otter-logo.png" alt="Tappy" width={52} height={52} className="shrink-0 rounded-full" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{t('admin.home.command.identity')}</h1>
              <Badge variant="muted">{t(`admin.home.env.${data.env}`)}</Badge>
            </div>
            {/* Line 2 = WHERE you are. Line 3 = who you are. An operator should
                answer "which workspace am I in?" without reading further. */}
            {scopeLabel && scopeKind ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-medium text-foreground">{scopeLabel}</span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{scopeKind}</span>
              </p>
            ) : null}
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('admin.home.command.greeting')} · <span className="text-foreground">{data.actor.email}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={data.actor.isOwner ? 'default' : 'muted'}>{roleLabel}</Badge>
            <span className="font-mono text-xs text-muted-foreground/60">{data.controllerVersion.slice(0, 7)}</span>
          </div>
          {/* The department switcher stood here. Owner decision 2026-08-21,
              option A: REMOVED. It offered a choice that changed nothing —
              `selected` was read only by its own `value`, it took no callback,
              no route accepted a department parameter, and `Actor` carries no
              department field for the PDP to consider. Nothing in the repository
              ever defined what selecting a department should DO
              (FOUNDATION-10 §1/§28/§33), so rather than invent behaviour the
              control is gone. Departments are still SHOWN below, and membership
              still scopes navigation — that part is contract-defined and wired. */}
        </div>
      </div>
    </header>
  )
}

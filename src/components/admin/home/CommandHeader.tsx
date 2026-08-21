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

// Controller V2 — command-center header. Brand anchor (Tappy otter) + contextual
// greeting + the actor's role/scope + environment. The scope selector offers only
// authorized departments. No fabricated data.
export function CommandHeader({ data }: { data: ControllerHomeData }) {
  const { t } = useTranslation()
  const roleLabel = data.actor.isOwner ? t('admin.role.owner') : t(ROLE_LABEL[data.actor.role] ?? 'admin.role.analyst')
  const modeLabel =
    data.mode === 'owner'
      ? t('admin.home.command.owner')
      : data.mode === 'department'
        ? t('admin.home.command.department')
        : t('admin.home.title')

  return (
    <header className="rounded-admin-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image src="/branding/otter-logo.png" alt="Tappy" width={52} height={52} className="shrink-0 rounded-full" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{t('admin.home.title')}</h1>
              <Badge variant="muted">{t(`admin.home.env.${data.env}`)}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('admin.home.command.greeting')} · <span className="text-foreground">{modeLabel}</span>
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

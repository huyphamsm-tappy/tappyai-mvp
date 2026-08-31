'use client'

import { Bell, Send, Radio, History } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useState } from 'react'
import { SendNotificationForm } from './SendNotificationForm'
import { BroadcastForm } from './BroadcastForm'

// Controller Notifications — PHASE A SHELL.
//
// It renders what the actor WILL be able to do and says plainly that none of it
// is built yet. No compose form, no recipient picker, no send button, and no
// call to any notification primitive — `emitNotification`, `sendNotificationToUser`,
// the broadcast route and both push providers are all untouched by Phase A.
//
// The two capability flags come from the PDP on the server. They control what is
// DRAWN; they authorize nothing. A future send route re-checks the same
// permissions per request, because a page that declines to render a button has
// not prevented anybody from calling an endpoint.
export function NotificationsShell({
  canSendUser,
  canBroadcast,
}: {
  canSendUser: boolean
  canBroadcast: boolean
}) {
  const { t } = useTranslation()

  // Targeted is the default: it is the everyday tool, and a broadcast should
  // never be the thing you land on.
  const [tab, setTab] = useState<'targeted' | 'broadcast'>('targeted')
  // An actor holding only one of the two permissions gets that one, whatever
  // the tab state says — so the tab can never select a form the PDP refused.
  const active = !canBroadcast ? 'targeted' : !canSendUser ? 'broadcast' : tab

  const rows = [
    {
      Icon: Send,
      titleKey: 'admin.notifications.cap.targeted',
      noteKey: 'admin.notifications.cap.targetedNote',
      granted: canSendUser,
    },
    {
      Icon: Radio,
      titleKey: 'admin.notifications.cap.broadcast',
      noteKey: 'admin.notifications.cap.broadcastNote',
      granted: canBroadcast,
    },
    {
      // Always granted on this page: reading history is what let the actor in.
      Icon: History,
      titleKey: 'admin.notifications.cap.history',
      noteKey: 'admin.notifications.cap.historyNote',
      granted: true,
    },
  ]

  return (
    <div className="max-w-[1400px] space-y-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-admin-md border border-border bg-muted text-ring"
        >
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">{t('admin.notifications.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.notifications.subtitle')}</p>
        </div>
      </div>

      {/* What this actor would be allowed to do, once the tool is built. Stating
          the grant honestly is more useful than a disabled button that gives no
          reason — and it makes the permission split visible to the operator. */}
      <section aria-labelledby="notif-caps-heading">
        <h2 id="notif-caps-heading" className="mb-3 text-sm font-semibold text-foreground">
          {t('admin.notifications.capsTitle')}
        </h2>
        <ul className="space-y-3">
          {rows.map(({ Icon, titleKey, noteKey, granted }) => (
            <li
              key={titleKey}
              className="flex items-start gap-3 rounded-admin-md border border-border bg-card p-4"
            >
              <span
                aria-hidden="true"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-admin-sm border border-border ${
                  granted ? 'bg-muted text-ring' : 'bg-muted/40 text-muted-foreground/50'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{t(titleKey)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(noteKey)}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
                  granted
                    ? 'border-border bg-muted text-foreground'
                    : 'border-border bg-transparent text-muted-foreground/60'
                }`}
              >
                {t(granted ? 'admin.notifications.granted' : 'admin.notifications.notGranted')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* The compose form appears only for an actor the PDP granted
          `notifications.send.user`. That is PRESENTATION: the send route
          re-checks the same permission on every request, so hiding the form
          prevents nothing that authorization was not already refusing, and
          showing it grants nothing. */}
      {/* ── Compose ──────────────────────────────────────────────────────
          Two tabs, and the broadcast one exists ONLY for an actor the PDP
          granted `notifications.send.broadcast`.

          🚨 `canBroadcast` USED TO BE DECORATION. It was computed on the server,
          passed here, and spent entirely on a granted/not-granted chip — the
          broadcast tool did not exist, so nothing gated on it. Now it gates the
          tab, the form and the action. That is still PRESENTATION: the route
          re-checks the permission and the origin on every request, and the
          server-side feature switch refuses a real send regardless of what this
          component renders. */}
      {canSendUser || canBroadcast ? (
        <section aria-labelledby="notif-compose-heading" className="space-y-4">
          <h2 id="notif-compose-heading" className="sr-only">
            {t('admin.notifications.composeHeading')}
          </h2>

          {canSendUser && canBroadcast ? (
            <div role="tablist" aria-label={t('admin.notifications.composeHeading')} className="flex gap-2">
              {(
                [
                  ['targeted', 'admin.notifications.tab.targeted'],
                  ['broadcast', 'admin.notifications.tab.broadcast'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`notif-tab-${key}`}
                  aria-selected={tab === key}
                  aria-controls={`notif-panel-${key}`}
                  data-testid={`notif-tab-${key}`}
                  onClick={() => setTab(key)}
                  className={`rounded-admin-sm border px-3 py-1.5 text-sm transition ${
                    tab === key
                      ? 'border-border bg-muted font-semibold text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          ) : null}

          <div
            role={canSendUser && canBroadcast ? 'tabpanel' : undefined}
            id={`notif-panel-${active}`}
            aria-labelledby={canSendUser && canBroadcast ? `notif-tab-${active}` : undefined}
          >
            {active === 'broadcast' ? <BroadcastForm /> : <SendNotificationForm />}
          </div>
        </section>
      ) : (
        <p className="rounded-admin-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t('admin.notifications.noSendPermission')}
        </p>
      )}
    </div>
  )
}

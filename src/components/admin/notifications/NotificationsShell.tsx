'use client'

import { Bell, Send, Radio, History } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { SendNotificationForm } from './SendNotificationForm'

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
      {canSendUser ? (
        <SendNotificationForm />
      ) : (
        <p className="rounded-admin-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {t('admin.notifications.noSendPermission')}
        </p>
      )}
    </div>
  )
}

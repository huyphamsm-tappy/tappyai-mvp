'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { LADDER } from '@/lib/safety/communityRules'

// What was decided about the signed-in person's OWN content, and the one appeal each decision gets. The API scopes by the caller;
// nothing here ever shows a reviewer, a reporter, or anyone else's decision.

interface Decision {
  id: string; created_at: string; rule_group: string; outcome: 'warning' | 'content_removed' | 'restricted' | 'banned'; restrict_days: number | null
  strike_expires_at: string | null; appeal: { status: 'pending' | 'upheld' | 'reversed' } | null; can_appeal: boolean
}

export default function NoticesView() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Decision[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/moderation/decisions')
      if (!res.ok) return setState('error')
      const json = await res.json()
      setRows(Array.isArray(json?.decisions) ? json.decisions : [])
      setState('ok')
    } catch { setState('error') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function send(id: string) {
    setMsg(null)
    try {
      const res = await fetch(`/api/moderation/decisions/${encodeURIComponent(id)}/appeal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text.trim() }) })
      if (!res.ok) return setMsg(t('notices.appeal.failed'))
      setMsg(t('notices.appeal.sent')); setOpen(null); setText(''); await load()
    } catch { setMsg(t('notices.appeal.failed')) }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">{t('notices.title')}</h1>
      <p className="text-muted-foreground text-sm">{t('notices.intro', { days: String(LADDER.appealWindowDays) })}</p>
      <a className="text-sm underline" href="/community-guidelines">{t('notices.guidelines')}</a>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {state === 'loading' && <p className="text-sm">{t('notices.loading')}</p>}
      {state === 'error' && <p className="text-destructive text-sm">{t('notices.error')}</p>}
      {state === 'ok' && rows && rows.length === 0 && <p className="text-muted-foreground text-sm">{t('notices.empty')}</p>}
      {state === 'ok' && rows?.map((d) => (
        <section key={d.id} className="border-border space-y-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">{new Date(d.created_at).toLocaleDateString()}</p>
          <p className="text-sm"><b>{t('notices.rule')}:</b> {t(`legal.community.r.${d.rule_group}.heading`)}</p>
          <p className="text-sm">{t(`notices.outcome.${d.outcome}`, { days: String(d.restrict_days ?? '') })}</p>
          {d.strike_expires_at && <p className="text-muted-foreground text-xs">{t('notices.strikeUntil', { date: new Date(d.strike_expires_at).toLocaleDateString() })}</p>}
          {d.appeal ? <p className="text-sm">{t(`notices.appeal.${d.appeal.status}`)}</p>
            : !d.can_appeal ? <p className="text-muted-foreground text-sm">{t('notices.appeal.closed')}</p>
            : open === d.id ? (
              <div className="space-y-2">
                <label className="block text-sm" htmlFor={`a-${d.id}`}>{t('notices.appeal.label')}</label>
                <textarea id={`a-${d.id}`} rows={4} className="border-border bg-background w-full rounded-md border p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
                <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={text.trim().length < 10} onClick={() => void send(d.id)}>{t('notices.appeal.send')}</button>
              </div>
            ) : <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => { setOpen(d.id); setText('') }}>{t('notices.appeal.cta')}</button>}
        </section>
      ))}
    </main>
  )
}

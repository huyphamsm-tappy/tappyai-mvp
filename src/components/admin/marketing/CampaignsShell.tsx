'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ─── V2.2-2 — the Marketing campaigns surface ────────────────────────────────
//
// Contract: M-16 (draft -> active -> completed; only a draft is editable) ·
// M-22 (the route authorizes; this only decides what is drawn) · M-33 (EN/VI).
//
// 🚨 THERE IS NO ACTIVATION CONTROL IN THIS COMPONENT, AND ITS ABSENCE IS
// DELIBERATE. Activation is what delivers to real people, and it stays blocked
// while M-30 (consent export) is UNSATISFIED and Q6 (who owns delivering it) is
// OPEN. Rather than render a disabled button that invites someone to "just
// enable it", the surface states the reason in words. A disabled control is a
// promise; a sentence is a fact.
//
// 🔑 WHAT IS DRAWN IS NEVER THE GUARD. `canCreate` and `canUpdate` come from
// the server-rendered page and decide presentation only. Every route calls
// `requirePermission` on its own, so a hidden form stops nobody and was never
// meant to.

export interface Campaign {
  id: string
  title: string
  body: string
  link: string | null
  status: 'draft' | 'active' | 'completed'
  created_at: string
}

const ENDPOINT = '/api/admin/marketing/campaigns'

export function CampaignsShell({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean
  canUpdate: boolean
}) {
  const { t } = useTranslation()
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT)
      // 🚨 `fetch` RESOLVES on 401/403/500. Without this the error branch below
      // never runs and `data` is parsed out of a refusal body.
      if (!res.ok) {
        setError(t('admin.marketing.campaigns.loadError'))
        return
      }
      const { data } = await res.json()
      setCampaigns(data as Campaign[])
      setError(null)
    } catch {
      setError(t('admin.marketing.campaigns.loadError'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => {
    setEditing(null)
    setTitle('')
    setBody('')
    setLink('')
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = { title, body, ...(link ? { link } : {}) }
      const res = editing
        ? await fetch(`${ENDPOINT}/${editing.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })

      // The same trap, and the one that matters more here: an optimistic list
      // update would show a campaign that was never stored.
      if (!res.ok) {
        setError(t('admin.marketing.campaigns.saveError'))
        return
      }
      reset()
      await load()
    } catch {
      setError(t('admin.marketing.campaigns.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (c: Campaign) => {
    setEditing(c)
    setTitle(c.title)
    setBody(c.body)
    setLink(c.link ?? '')
  }

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !busy

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t('admin.marketing.campaigns.heading')}
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          {t('admin.marketing.campaigns.blurb')}
        </p>
      </div>

      {/*
        The activation state, stated rather than implied. This is the only place
        an operator learns why there is no send button, and it names both gates
        so nobody has to guess which one moved.
      */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        {t('admin.marketing.campaigns.activationBlocked')}
      </div>

      {(canCreate || canUpdate) && (
        <section className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {editing
              ? t('admin.marketing.campaigns.editHeading')
              : t('admin.marketing.campaigns.newHeading')}
          </h2>

          <label className="block">
            <span className="text-xs text-content-secondary">
              {t('admin.marketing.campaigns.title')}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
              aria-label={t('admin.marketing.campaigns.title')}
            />
          </label>

          <label className="block">
            <span className="text-xs text-content-secondary">
              {t('admin.marketing.campaigns.body')}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
              aria-label={t('admin.marketing.campaigns.body')}
            />
          </label>

          <label className="block">
            <span className="text-xs text-content-secondary">
              {t('admin.marketing.campaigns.link')}
            </span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={500}
              placeholder="/deals"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
              aria-label={t('admin.marketing.campaigns.link')}
            />
            <span className="mt-1 block text-xs text-gray-400">
              {t('admin.marketing.campaigns.linkHint')}
            </span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editing
                ? t('admin.marketing.campaigns.save')
                : t('admin.marketing.campaigns.create')}
            </button>
            {editing && (
              <button
                onClick={reset}
                disabled={busy}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm"
              >
                {t('admin.marketing.campaigns.cancel')}
              </button>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          {t('admin.marketing.campaigns.listHeading')}
        </h2>

        {campaigns === null ? null : campaigns.length === 0 ? (
          <p className="text-sm text-content-secondary">
            {t('admin.marketing.campaigns.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {campaigns.map((c) => (
              <li key={c.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {c.title}
                  </p>
                  <p className="text-xs text-content-secondary truncate">{c.body}</p>
                  <span className="mt-1 inline-block rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300">
                    {t(`admin.marketing.campaigns.status.${c.status}`)}
                  </span>
                </div>

                {/*
                  Edit appears only for a draft (M-16). An active campaign is
                  mid-send and a completed one is a record of something that
                  already happened — the route refuses both independently.
                */}
                {canUpdate && c.status === 'draft' && (
                  <button
                    onClick={() => startEdit(c)}
                    className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs"
                  >
                    {t('admin.marketing.campaigns.edit')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

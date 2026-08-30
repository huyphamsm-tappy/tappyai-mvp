'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useGuardedActionProps } from '@/components/admin/layout/GuardedSurface'

// Module 08 — internal admin notes.
//
// CONTRACT — 10_User_Management.md §3.8: "Chronological internal notes from
// user_notes. Pinned notes shown at top. Add new note inline." §3.9 gives
// adding to `moderator`.
//
// The ORDER is decided by the server (`orderNotes`) and rendered here as
// received. Two implementations of "pinned first, then newest" is how a list
// starts disagreeing with itself between the API and the screen.
//
// AUTHORIZATION LIVES IN THE API. Both `can` flags arrive as props from
// `permissionEngine.can` on the server and gate AFFORDANCES only. This file
// names no role and compares nothing.
//
// WHAT IS DELIBERATELY ABSENT: no edit, no delete, no unpin. §3.8 describes a
// chronological record with an inline add, and nothing else. An internal note
// that can be quietly rewritten or removed is not a record.

interface NoteRow {
  id: string
  user_id: string
  author_id: string
  note: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface NotesCapabilities {
  /** `users.notes.read` */
  read: boolean
  /** `users.notes.write` */
  write: boolean
}

/** Matches the server schema, so the form refuses what the API would refuse. */
const NOTE_MAX = 2000
const noteReady = (text: string) => {
  const t = text.trim()
  return t.length > 0 && t.length <= NOTE_MAX
}

type Load = 'loading' | 'ok' | 'empty' | 'error'

const fmt = (iso: string) => new Date(iso).toLocaleString()

export function UserNotesPanel({ userId, can }: { userId: string; can: NotesCapabilities }) {
  const { t } = useTranslation()
  const guard = useGuardedActionProps()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [load, setLoad] = useState<Load>('loading')
  const [draft, setDraft] = useState('')
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = useCallback(async () => {
    setLoad('loading')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`)
      if (!res.ok) return setLoad('error')
      const json = await res.json()
      // A payload that is not a list is not an empty list. `notes.map` on it
      // would take the whole user detail down; treating it as an error says
      // "we got something we do not understand", which is what happened.
      if (!Array.isArray(json?.data)) return setLoad('error')
      const rows = json.data as NoteRow[]
      setNotes(rows)
      // A failed read already returned. Nothing here means there genuinely are
      // no notes — a different fact, and one an operator acts on.
      setLoad(rows.length === 0 ? 'empty' : 'ok')
    } catch {
      setLoad('error')
    }
  }, [userId])

  useEffect(() => {
    // An actor who may not read must not cause a read.
    if (!can.read) return
    void list()
  }, [can.read, list])

  async function submit() {
    if (!noteReady(draft)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `note` and `isPinned` only. The author is the authenticated actor and
        // the server takes it from the session; sending one would be rejected.
        body: JSON.stringify({ note: draft.trim(), isPinned: pinned }),
      })
      if (!res.ok) {
        setError(t('admin.notes.addError'))
        return
      }
      setDraft('')
      setPinned(false)
      // Re-read rather than push locally: the server owns the order.
      await list()
    } catch {
      setError(t('admin.notes.addError'))
    } finally {
      setBusy(false)
    }
  }

  if (!can.read) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.notes.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs">{t('admin.notes.subtitle')}</p>

        {can.write && (
          <div className="space-y-2">
            <label htmlFor="note-draft" className="text-sm font-medium">
              {t('admin.notes.addLabel')}
            </label>
            <Input
              id="note-draft"
              value={draft}
              maxLength={NOTE_MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('admin.notes.addPlaceholder')}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                {t('admin.notes.pin')}
              </label>
              <Button size="sm" onClick={() => void submit()} title={guard.title} disabled={busy || !noteReady(draft) || guard.disabled}>
                {t('admin.notes.add')}
              </Button>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        {load === 'loading' ? (
          <p className="text-muted-foreground text-sm">{t('admin.common.loading')}</p>
        ) : load === 'error' ? (
          // NOT the empty state. "No notes" is a claim an operator acts on.
          <p className="text-destructive text-sm">{t('admin.notes.error')}</p>
        ) : load === 'empty' ? (
          <p className="text-muted-foreground text-sm">{t('admin.notes.empty')}</p>
        ) : (
          <ul aria-label={t('admin.notes.title')} className="divide-border divide-y">
            {notes.map((n) => (
              <li key={n.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {n.is_pinned && <Badge variant="warning">{t('admin.notes.pinned')}</Badge>}
                  <span className="text-muted-foreground text-xs">{fmt(n.created_at)}</span>
                </div>
                {/* Rendered as TEXT. React escapes it, and nothing here sets
                    innerHTML: an operator's free text must never become markup. */}
                <p className="text-sm whitespace-pre-wrap">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

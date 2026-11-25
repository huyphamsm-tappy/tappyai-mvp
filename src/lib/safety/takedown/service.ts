// Authority takedown register: record a request, carry it out, close it. Service-role client only (the table has no client access). Every function takes the client as an argument so a test can
// hand it a fake. Nothing here decides WHETHER content is unlawful: a person records a request and a person carries it out; this code keeps the clock, applies the existing hide mechanisms,
// and keeps a copy of what was taken down.
import type { SupabaseClient } from '@supabase/supabase-js'
import { dueAt, type TakedownStatus, type TakedownUrgency } from './clock'
import { publicationStateFor } from '@/lib/admin/moderation/moderationService'

export type TargetType = 'review' | 'comment' | 'plan_share' | 'user'
export type ActionTaken = 'hidden' | 'deleted' | 'banned' | 'none'

export interface TakedownRow {
  id: string
  created_at: string
  received_at: string
  source: 'authority' | 'user_complaint'
  agency: string
  reference_no: string | null
  legal_basis: string | null
  urgency: TakedownUrgency
  due_at: string
  target_type: TargetType
  target_id: string
  status: TakedownStatus
  action_taken: ActionTaken | null
  actioned_at: string | null
  actioned_by: string | null
  recorded_by: string
  notes: string | null
}

export const ROW_COLUMNS = 'id, created_at, received_at, source, agency, reference_no, legal_basis, urgency, due_at, target_type, target_id, status, action_taken, actioned_at, actioned_by, recorded_by, notes'

/** What "carrying it out" means for each kind of target, through the mechanisms that already exist. */
export const ACTION_FOR_TARGET: Record<TargetType, ActionTaken> = { review: 'hidden', comment: 'hidden', plan_share: 'deleted', user: 'banned' }

/** The person a target belongs to, and whether it exists. A copy of the content at the time of the call (for the legal record). */
export interface ResolvedTakedownTarget { exists: boolean; ownerId: string | null; snapshot: Record<string, unknown> | null }

export async function resolveTakedownTarget(admin: SupabaseClient, type: TargetType, id: string): Promise<ResolvedTakedownTarget> {
  if (type === 'review') {
    const { data } = await admin.from('reviews').select('id, user_id, place_name, body, publication_state, created_at').eq('id', id).maybeSingle()
    const r = data as { user_id: string; place_name: string | null; body: string | null; publication_state: string | null; created_at: string } | null
    return r ? { exists: true, ownerId: r.user_id, snapshot: { kind: 'review', ...r } } : { exists: false, ownerId: null, snapshot: null }
  }
  if (type === 'comment') {
    const { data } = await admin.from('review_comments').select('id, review_id, user_id, body, created_at, hidden_at').eq('id', id).maybeSingle()
    const c = data as { user_id: string } | null
    return c ? { exists: true, ownerId: c.user_id, snapshot: { kind: 'comment', ...c } } : { exists: false, ownerId: null, snapshot: null }
  }
  if (type === 'plan_share') {
    const { data } = await admin.from('plan_shares').select('id, owner_id, plan, created_at').eq('id', id).maybeSingle()
    const p = data as { owner_id: string } | null
    return p ? { exists: true, ownerId: p.owner_id, snapshot: { kind: 'plan_share', ...p } } : { exists: false, ownerId: null, snapshot: null }
  }
  const { data } = await admin.from('profiles').select('id, full_name, bio, created_at').eq('id', id).maybeSingle()
  const u = data as { id: string } | null
  return u ? { exists: true, ownerId: u.id, snapshot: { kind: 'user', ...u } } : { exists: false, ownerId: null, snapshot: null }
}

export interface CreateInput {
  source: 'authority' | 'user_complaint'
  agency: string
  reference_no?: string
  legal_basis?: string
  urgency: TakedownUrgency
  received_at: string
  target_type: TargetType
  target_id: string
  notes?: string
}

export type CreateResult = { ok: true; row: TakedownRow } | { ok: false; error: 'target_not_found' | 'received_in_future' | 'duplicate_open' | 'db' }

export async function createTakedown(admin: SupabaseClient, input: CreateInput, recordedBy: string, now: Date = new Date()): Promise<CreateResult> {
  const received = new Date(input.received_at)
  if (received.getTime() > now.getTime() + 60_000) return { ok: false, error: 'received_in_future' }
  const target = await resolveTakedownTarget(admin, input.target_type, input.target_id)
  if (!target.exists) return { ok: false, error: 'target_not_found' }
  // The same content already has an OPEN request: do not start a second clock for it.
  const open = await admin.from('authority_takedowns').select('id').eq('target_type', input.target_type).eq('target_id', input.target_id).in('status', ['received', 'needs_info']).limit(1)
  if (open.error) return { ok: false, error: 'db' }
  if ((open.data ?? []).length > 0) return { ok: false, error: 'duplicate_open' }
  const ins = await admin.from('authority_takedowns').insert({
    received_at: received.toISOString(), source: input.source, agency: input.agency, reference_no: input.reference_no ?? null, legal_basis: input.legal_basis ?? null,
    urgency: input.urgency, due_at: dueAt(received, input.urgency).toISOString(), target_type: input.target_type, target_id: input.target_id, recorded_by: recordedBy, notes: input.notes ?? null,
  }).select(ROW_COLUMNS).maybeSingle()
  if (ins.error || !ins.data) return { ok: false, error: 'db' }
  return { ok: true, row: ins.data as unknown as TakedownRow }
}

export interface ExecuteDeps {
  /** Ban an account (the existing helper). Injected so the route supplies the real one and a test a fake. */
  banUser?: (admin: SupabaseClient, userId: string, reason: string) => Promise<unknown>
  revokeSessions?: (admin: SupabaseClient, userId: string) => Promise<boolean>
  now?: () => Date
}

export type ExecuteResult = { ok: true; action: ActionTaken; row: TakedownRow } | { ok: false; error: 'not_found' | 'already_closed' | 'target_not_found' | 'effect_failed' | 'db' }

/** Carry the takedown out: take a copy of the content, apply the effect, close the request. A request that is already closed is left alone. */
export async function executeTakedown(admin: SupabaseClient, id: string, actorId: string, notes: string | undefined, deps: ExecuteDeps = {}): Promise<ExecuteResult> {
  const now = (deps.now ?? (() => new Date()))()
  const cur = await admin.from('authority_takedowns').select(ROW_COLUMNS).eq('id', id).maybeSingle()
  if (cur.error) return { ok: false, error: 'db' }
  const row = cur.data as unknown as TakedownRow | null
  if (!row) return { ok: false, error: 'not_found' }
  if (row.status === 'actioned' || row.status === 'rejected') return { ok: false, error: 'already_closed' }

  const target = await resolveTakedownTarget(admin, row.target_type, row.target_id)
  const action = ACTION_FOR_TARGET[row.target_type]
  if (!target.exists) {
    // The content is already gone (deleted by its author or an earlier action): the request is closed as "none", with the copy we no longer have recorded as absent.
    return closeRow(admin, row, { status: 'actioned', action: 'none', actorId, nowIso: now.toISOString(), snapshot: null, notes: appendNote(notes, 'target no longer existed when the request was carried out') })
  }

  try {
    if (row.target_type === 'review') {
      const r = await admin.from('reviews').update({ publication_state: publicationStateFor('hide') }).eq('id', row.target_id)
      if (r.error) return { ok: false, error: 'effect_failed' }
    } else if (row.target_type === 'comment') {
      const r = await admin.from('review_comments').update({ hidden_at: now.toISOString(), hidden_by: 'moderator' }).eq('id', row.target_id)
      if (r.error) return { ok: false, error: 'effect_failed' }
    } else if (row.target_type === 'plan_share') {
      const r = await admin.from('plan_shares').delete().eq('id', row.target_id)
      if (r.error) return { ok: false, error: 'effect_failed' }
    } else {
      if (!deps.banUser) return { ok: false, error: 'effect_failed' }
      await deps.banUser(admin, row.target_id, `authority takedown ${row.reference_no ?? row.id}`)
      if (deps.revokeSessions) await deps.revokeSessions(admin, row.target_id)
    }
  } catch {
    return { ok: false, error: 'effect_failed' }
  }
  return closeRow(admin, row, { status: 'actioned', action, actorId, nowIso: now.toISOString(), snapshot: target.snapshot, notes })
}

export async function rejectOrAskInfo(admin: SupabaseClient, id: string, actorId: string, kind: 'reject' | 'needs_info', notes: string, now: Date = new Date()): Promise<ExecuteResult> {
  const cur = await admin.from('authority_takedowns').select(ROW_COLUMNS).eq('id', id).maybeSingle()
  if (cur.error) return { ok: false, error: 'db' }
  const row = cur.data as unknown as TakedownRow | null
  if (!row) return { ok: false, error: 'not_found' }
  if (row.status === 'actioned' || row.status === 'rejected') return { ok: false, error: 'already_closed' }
  if (kind === 'needs_info') {
    const upd = await admin.from('authority_takedowns').update({ status: 'needs_info', notes: appendNote(row.notes ?? undefined, notes) }).eq('id', id).select(ROW_COLUMNS).maybeSingle()
    if (upd.error || !upd.data) return { ok: false, error: 'db' }
    return { ok: true, action: 'none', row: upd.data as unknown as TakedownRow }
  }
  return closeRow(admin, row, { status: 'rejected', action: 'none', actorId, nowIso: now.toISOString(), snapshot: null, notes })
}

const appendNote = (a: string | undefined, b: string): string => [a, b].filter(Boolean).join(' | ').slice(0, 2000)

async function closeRow(admin: SupabaseClient, row: TakedownRow, o: { status: 'actioned' | 'rejected'; action: ActionTaken; actorId: string; nowIso: string; snapshot: Record<string, unknown> | null; notes: string | undefined }): Promise<ExecuteResult> {
  const upd = await admin.from('authority_takedowns').update({
    status: o.status, action_taken: o.action, actioned_at: o.nowIso, actioned_by: o.actorId, content_snapshot: o.snapshot, notes: o.notes ? appendNote(row.notes ?? undefined, o.notes) : row.notes,
  }).eq('id', row.id).select(ROW_COLUMNS).maybeSingle()
  if (upd.error || !upd.data) return { ok: false, error: 'db' }
  return { ok: true, action: o.action, row: upd.data as unknown as TakedownRow }
}

/** Open requests (received or waiting for information), most urgent first. */
export async function listOpenTakedowns(admin: SupabaseClient, limit = 200): Promise<TakedownRow[] | null> {
  const { data, error } = await admin.from('authority_takedowns').select(ROW_COLUMNS).in('status', ['received', 'needs_info']).order('due_at', { ascending: true }).limit(limit)
  if (error) return null
  return (data ?? []) as unknown as TakedownRow[]
}

/** The most recent requests of any status (the register itself), newest first. */
export async function listRecentTakedowns(admin: SupabaseClient, limit = 100): Promise<TakedownRow[] | null> {
  const { data, error } = await admin.from('authority_takedowns').select(ROW_COLUMNS).order('created_at', { ascending: false }).limit(limit)
  if (error) return null
  return (data ?? []) as unknown as TakedownRow[]
}

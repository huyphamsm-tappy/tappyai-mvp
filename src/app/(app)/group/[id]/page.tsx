'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Header from '@/components/Header'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'
import BottomNav from '@/components/BottomNav'
import { Copy, Check, Users, Loader2 } from 'lucide-react'
import GroupAvatarPicker from '../GroupAvatarPicker'
import GroupBill, { type BillPerson, type BillShape } from './GroupBill'
import { uploadGroupAvatar } from '@/lib/groups/avatarClient'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { GROUP_BUDGETS, budgetKeyFor } from '@/lib/group/budgets'

type Member = {
  id: string
  name: string
  budget: string
  food_preferences: string
  dietary_restrictions: string
  area: string
}

type Group = {
  id: string
  name: string
  creator_id: string
  status: string
  suggestion: string | null
  avatar_url?: string | null
  members: Member[]
  /** the leader alone gets the requests that wait for an answer (owner 20/11: a group is private) */
  pendingRequests?: Member[]
  /** the suggestion as cards of real places, the vote and the decision (owner 20/11: one vote each, more than half decides) */
  suggestion_options?: Card[] | null
  chosen_option?: string | null
  votes?: VoteState
  /** the people of the meal by opaque key, and the bill of the meal (owner 20/11) */
  people?: BillPerson[]
  bill?: BillShape | null
}

type Card = { id: string; name: string; address?: string; rating?: number; why: string; maps_link?: string; photo_url?: string }
type VoteState = { counts: Record<string, number>; mine: string | null; voted: number; participants: number; majority: string | null; allVoted: boolean }

/** What a person who is NOT yet a member is told: the group's name and whether their request waits. */
type Gate = { state: 'pending' | 'none'; id: string; name: string }


export default function GroupPage() {
  const params = useParams()
  const id = params.id as string
  const { t } = useTranslation()
  /** A stored budget shows in the viewer's language when it is one of the form's choices, else as typed (an older row). */
  const budgetText = (v: string | null | undefined): string => { const k = budgetKeyFor(v); return k ? t(k) : (v ?? '') }
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSaved, setAvatarSaved] = useState(false)

  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [gate, setGate] = useState<Gate | null>(null)
  const [needLogin, setNeedLogin] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [foodPrefs, setFoodPrefs] = useState('')
  const [dietary, setDietary] = useState('')
  const [area, setArea] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/group?id=${id}`)
      if (res.status === 401) { setNeedLogin(true); return }
      if (!res.ok) return
      const data = await res.json()
      if (data.state === 'pending' || data.state === 'none') {
        // not a member (yet): only the name is known; the page draws the request form or the "waiting" card around it
        setGate({ state: data.state, id: data.id, name: data.name })
        setGroup({ id: data.id, name: data.name, creator_id: '', status: 'open', suggestion: null, members: [] })
      } else {
        setGate(null)
        setGroup(data)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth.getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null)
      })
      .finally(() => setAuthChecked(true))

    fetchGroup()
  }, [id, fetchGroup])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !budget || !area.trim()) return
    setJoining(true)
    setJoinError('')
    try {
      const res = await fetch(`/api/group/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          budget,
          food_preferences: foodPrefs.trim(),
          dietary_restrictions: dietary.trim(),
          area: area.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setJoinError(err.message || err.error || t('groupDining.joinFailed'))
        return
      }
      // opening the link only filed a REQUEST: the server says where the person stands (waiting for the leader)
      fetchGroup()
    } catch {
      setJoinError(t('groupDining.connFailed'))
    } finally {
      setJoining(false)
    }
  }

  async function handleSuggest() {
    setSuggesting(true)
    try {
      const res = await fetch(`/api/group/${id}/suggest`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        alert(err.message || err.error || t('groupDining.suggestFailed'))
        return
      }
      const data = await res.json()
      // a new suggestion starts a new vote
      setGroup(prev => prev ? { ...prev, suggestion: data.suggestion, suggestion_options: data.options?.length ? data.options : null, chosen_option: null, votes: undefined } : prev)
      if (data.options?.length) fetchGroup()
    } catch {
      alert(t('groupDining.connFailed'))
    } finally {
      setSuggesting(false)
    }
  }

  /** One vote (the same call changes it), or the leader's choice when everyone has voted and nobody has more than half. */
  async function castVote(optionId: string, kind: 'vote' | 'choose') {
    setActionBusy(`${kind}-${optionId}`)
    setActionError('')
    try {
      const res = await fetch(`/api/group/${id}/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId }) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); setActionError(err.message || t('groupDining.actionFailed')); await fetchGroup(); return }
      await fetchGroup()
    } catch {
      setActionError(t('groupDining.actionFailed'))
    } finally {
      setActionBusy(null)
    }
  }

  function handleResuggest() {
    if (!window.confirm(t('groupDining.confirmResuggest'))) return
    void handleSuggest()
  }

  /** The leader accepts or declines a request, or removes an accepted member. */
  async function decide(memberId: string, action: 'approve' | 'decline' | 'remove') {
    setActionBusy(memberId)
    setActionError('')
    try {
      const res = await fetch(`/api/group/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, action }) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); setActionError(err.message || t('groupDining.actionFailed')); return }
      await fetchGroup()
    } catch {
      setActionError(t('groupDining.actionFailed'))
    } finally {
      setActionBusy(null)
    }
  }

  /** A member leaves, a pending person withdraws the request, the leader deletes the group; then back to the tools list. */
  async function endGroup(kind: 'leave' | 'delete') {
    if (!window.confirm(t(kind === 'leave' ? 'groupDining.confirmLeave' : 'groupDining.confirmDelete'))) return
    setActionBusy(kind)
    setActionError('')
    try {
      const res = await fetch(kind === 'leave' ? `/api/group/${id}/leave` : `/api/group/${id}`, { method: kind === 'leave' ? 'POST' : 'DELETE' })
      if (!res.ok) { const err = await res.json().catch(() => ({})); setActionError(err.message || t('groupDining.actionFailed')); return }
      window.location.href = SMART_TOOLS_HREF
    } catch {
      setActionError(t('groupDining.actionFailed'))
    } finally {
      setActionBusy(null)
    }
  }

  async function saveAvatar() {
    if (!avatarFile) return
    setAvatarBusy(true)
    setAvatarError('')
    setAvatarSaved(false)
    const up = await uploadGroupAvatar(id, avatarFile, t('groupNew.avatarErr.failed'))
    setAvatarBusy(false)
    if (!up.ok) { setAvatarError(up.message); return }
    setGroup(prev => prev ? { ...prev, avatar_url: up.url } : prev)
    setAvatarFile(null)
    setAvatarSaved(true)
  }

  async function copyLink() {
    const link = `${window.location.origin}/group/${id}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !authChecked) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-link" size={32} />
      </div>
    )
  }

  if (needLogin) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-3 px-4 text-center" data-testid="group-need-login">
        <Users className="text-link" size={36} />
        <h1 className="font-bold text-gray-900 dark:text-white text-lg">{t('groupDining.needLogin')}</h1>
        <p className="text-sm text-content-secondary max-w-sm">{t('groupDining.needLoginBody')}</p>
        <a href={`/login?returnTo=${encodeURIComponent(`/group/${id}`)}`} className="px-5 py-2.5 bg-interactive text-white font-semibold rounded-2xl">{t('groupDining.signIn')}</a>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-3 px-4">
        <div className="text-4xl">😕</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">{t('groupDining.notFound')}</p>
      </div>
    )
  }

  const isCreator = !!group && !!currentUserId && group.creator_id === currentUserId

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Phase 7 §13: Back pops the in-app history and falls back to Smart Tools, this
        * page's usual parent. A fixed `backHref="/"` sent every Back to Home. */}
      <Header showBack backFallbackHref={SMART_TOOLS_HREF} title={group.name} />
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Group header card */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center shrink-0 overflow-hidden">
              {group.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={group.avatar_url} alt={group.name} className="w-full h-full object-cover" />
                : <Users className="text-white" size={22} />}
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-lg">{group.name}</h1>
              {!gate && <p className="text-sm text-content-secondary">{t('groupDining.memberCount', { count: String(group.members.length) })}</p>}
            </div>
          </div>
        </div>

        {/* CREATOR VIEW */}
        {isCreator && (
          <>
            {/* Group picture — creator only (the route enforces it too) */}
            <div className="card p-4 space-y-3">
              <GroupAvatarPicker currentUrl={group.avatar_url} file={avatarFile} onPick={f => { setAvatarFile(f); setAvatarSaved(false); setAvatarError('') }} busy={avatarBusy} error={avatarError} />
              {avatarFile && (
                <button type="button" onClick={saveAvatar} disabled={avatarBusy} className="text-link font-semibold text-sm disabled:opacity-50">
                  {avatarBusy ? t('groupNew.avatarUploading') : t('groupNew.avatarSave')}
                </button>
              )}
              {avatarSaved && <p className="text-sm text-green-600" role="status">{t('groupNew.avatarSaved')}</p>}
            </div>

            {/* Share link */}
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">{t('groupDining.shareLink')}</p>
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate font-mono">
                  {typeof window !== 'undefined' ? `${window.location.origin}/group/${id}` : `tappyai.com/group/${id}`}
                </span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 text-link font-semibold text-sm shrink-0 transition-all"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? t('groupDining.copied') : t('groupDining.copy')}
                </button>
              </div>
            </div>

            <p className="text-xs text-content-secondary px-1" data-testid="group-private-note">{t('groupDining.privateNote')}</p>

            {/* Requests waiting for the leader's answer (owner 20/11: the leader accepts who comes in) */}
            {(group.pendingRequests?.length ?? 0) > 0 && (
              <div className="card p-4" data-testid="group-requests">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{t('groupDining.requestsTitle', { count: String(group.pendingRequests!.length) })}</p>
                <div className="space-y-3">
                  {group.pendingRequests!.map(m => (
                    <div key={m.id} className="pb-3 border-b border-gray-100 dark:border-gray-800 last:border-0" data-testid="group-request">
                      <p className="font-semibold text-gray-900 dark:text-white">{m.name}</p>
                      <div className="mt-1 space-y-0.5 text-sm text-content-secondary">
                        {m.budget && <p>💰 {budgetText(m.budget)}</p>}
                        {m.food_preferences && <p>🍽️ {m.food_preferences}</p>}
                        {m.dietary_restrictions && <p>🚫 {m.dietary_restrictions}</p>}
                        {m.area && <p>📍 {m.area}</p>}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={actionBusy === m.id} onClick={() => decide(m.id, 'approve')} className="px-3 py-1.5 rounded-xl bg-interactive text-white text-sm font-semibold disabled:opacity-60">{t('groupDining.approve')}</button>
                        <button type="button" disabled={actionBusy === m.id} onClick={() => decide(m.id, 'decline')} className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-60">{t('groupDining.decline')}</button>
                      </div>
                    </div>
                  ))}
                </div>
                {actionError && <p role="alert" className="mt-2 text-sm text-red-500">{actionError}</p>}
              </div>
            )}

            {/* Member list */}
            {group.members.length > 0 ? (
              <div className="card p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{t('groupDining.membersTitle')}</p>
                <div className="space-y-3">
                  {group.members.map((m, i) => (
                    <div
                      key={m.id}
                      className={`pb-3 ${i < group.members.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
                    >
                      <p className="font-semibold text-gray-900 dark:text-white">{m.name}</p>
                      <div className="mt-1 space-y-0.5 text-sm text-content-secondary">
                        {m.budget && <p>💰 {budgetText(m.budget)}</p>}
                        {m.food_preferences && <p>🍽️ {t('groupDining.likes', { v: m.food_preferences })}</p>}
                        {m.dietary_restrictions && <p>🚫 {t('groupDining.avoids', { v: m.dietary_restrictions })}</p>}
                        {m.area && <p>📍 {t('groupDining.areaLine', { v: m.area })}</p>}
                      </div>
                      <button type="button" disabled={actionBusy === m.id} onClick={() => decide(m.id, 'remove')} className="mt-1.5 text-xs text-red-500 font-medium disabled:opacity-60">{t('groupDining.remove')}</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card p-4 text-center text-sm text-content-secondary">
                {t('groupDining.noMembersYet')}
              </div>
            )}

            {/* Suggest button */}
            {group.members.length > 0 && !(group.suggestion_options && group.suggestion_options.length > 0) && (
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className="w-full py-3 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95 shadow-sm"
              >
                {suggesting ? (
                  <><Loader2 size={18} className="animate-spin" /> {t('groupDining.thinking')}</>
                ) : (
                  t('groupDining.suggestNow')
                )}
              </button>
            )}
          </>
        )}

        {/* NOT A MEMBER YET: the request form (opening the link only asks to join) */}
        {gate?.state === 'none' && (
          <div className="card p-5" data-testid="group-request-form">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">{t('groupDining.requestTitle', { name: group.name })}</h2>
            <p className="text-sm text-content-secondary mb-4">{t('groupDining.requestBody')}</p>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('groupDining.nameLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('groupDining.namePlaceholder')}
                  maxLength={50}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('groupDining.budgetLabel')} <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {GROUP_BUDGETS.map(b => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setBudget(b.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                        budget === b.value
                          ? 'bg-interactive text-white border-primary-500'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-300'
                      }`}
                    >
                      {t(b.key)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('groupDining.foodLabel')}</label>
                <input
                  type="text"
                  value={foodPrefs}
                  onChange={e => setFoodPrefs(e.target.value)}
                  placeholder={t('groupDining.foodPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('groupDining.dietLabel')}</label>
                <input
                  type="text"
                  value={dietary}
                  onChange={e => setDietary(e.target.value)}
                  placeholder={t('groupDining.dietPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('groupDining.areaLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder={t('groupDining.areaPlaceholder')}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                />
              </div>

              {joinError && <p className="text-sm text-red-500 dark:text-red-400">{joinError}</p>}

              <button
                type="submit"
                disabled={joining || !name.trim() || !budget || !area.trim()}
                className="w-full py-3 bg-interactive text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 transition-all active:scale-95"
              >
                {joining ? <Loader2 size={18} className="animate-spin" /> : null}
                {t('groupDining.requestButton')}
              </button>
            </form>
          </div>
        )}

        {/* REQUEST SENT: waiting for the leader to accept */}
        {gate?.state === 'pending' && (
          <div className="card p-6 text-center" data-testid="group-pending">
            <div className="text-4xl mb-3">⏳</div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('groupDining.pendingTitle')}</h2>
            <p className="text-sm text-content-secondary mt-1">{t('groupDining.pendingBody')}</p>
            <button type="button" disabled={actionBusy === 'leave'} onClick={() => endGroup('leave')} className="mt-3 text-sm text-red-500 font-medium disabled:opacity-60">{t('groupDining.withdraw')}</button>
          </div>
        )}

        {/* ACCEPTED MEMBER: waiting for the leader's suggestion, and the way out */}
        {!isCreator && !gate && !group.suggestion && (
          <div className="card p-6 text-center">
            <p className="text-sm text-content-secondary">{t('groupDining.waitingSuggest')}</p>
          </div>
        )}

        {/* Suggestion as CARDS of real places: one vote each, more than half decides (owner 20/11) */}
        {!gate && group.suggestion_options && group.suggestion_options.length > 0 && (
          <div className="space-y-3" data-testid="group-cards">
            <div className="flex items-center gap-2 px-1">
              <span className="text-2xl">🍽️</span>
              <h2 className="font-bold text-gray-900 dark:text-white">{t('groupDining.suggestTitle')}</h2>
            </div>
            {group.chosen_option && (
              <div className="card p-4 border-2 border-primary-400" data-testid="group-chosen">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">{t('groupDining.chosenTitle')}</p>
                <p className="font-bold text-gray-900 dark:text-white text-lg">{group.suggestion_options.find(c => c.id === group.chosen_option)?.name}</p>
              </div>
            )}
            {group.votes && !group.chosen_option && (
              <p className="text-xs text-content-secondary px-1" data-testid="group-progress">{t('groupDining.progress', { voted: String(group.votes.voted), total: String(group.votes.participants) })}</p>
            )}
            {!group.chosen_option && group.votes?.allVoted && !group.votes.majority && (
              <p className="text-sm text-amber-700 dark:text-amber-300 px-1" data-testid="group-tie">{t(isCreator ? 'groupDining.tieNote' : 'groupDining.tieWait')}</p>
            )}
            {group.suggestion_options.map(c => {
              const n = group.votes?.counts?.[c.id] ?? 0
              const mine = group.votes?.mine === c.id
              const isChosen = group.chosen_option === c.id
              return (
                <div key={c.id} className={`card p-4 ${isChosen ? 'ring-2 ring-primary-400' : ''}`} data-testid="group-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">{c.name}{typeof c.rating === 'number' ? ` · ⭐ ${c.rating}` : ''}</p>
                      {c.address && <p className="text-xs text-content-secondary mt-0.5">📍 {c.address}</p>}
                      {c.why && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1.5 leading-relaxed">{c.why}</p>}
                      {c.maps_link && <a href={c.maps_link} target="_blank" rel="noopener noreferrer" className="text-link text-xs font-medium mt-1 inline-block">{t('groupDining.openMap')}</a>}
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300" data-testid="group-card-votes">{t('groupDining.votesCount', { n: String(n) })}</span>
                  </div>
                  {!group.chosen_option && (isCreator || !gate) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={actionBusy === `vote-${c.id}`} onClick={() => castVote(c.id, 'vote')} className={`px-3 py-1.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${mine ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'bg-interactive text-white'}`}>{mine ? t('groupDining.yourVote') : t('groupDining.vote')}</button>
                      {isCreator && group.votes?.allVoted && !group.votes.majority && (
                        <button type="button" disabled={actionBusy === `choose-${c.id}`} onClick={() => castVote(c.id, 'choose')} className="px-3 py-1.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-60">{t('groupDining.choose')}</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {isCreator && (
              <button type="button" disabled={suggesting} onClick={handleResuggest} className="w-full text-center text-sm text-link font-medium py-2 disabled:opacity-60" data-testid="group-resuggest">{t('groupDining.resuggest')}</button>
            )}
            {actionError && <p role="alert" className="text-sm text-red-500 text-center">{actionError}</p>}
          </div>
        )}

        {/* The bill of the meal: whoever paid enters it, everyone sees what they owe the payer (owner 20/11) */}
        {!gate && group.people && group.people.length >= 2 && (
          <GroupBill groupId={id} people={group.people} bill={group.bill ?? null} onChanged={fetchGroup} />
        )}

        {/* Suggestion result as plain text — visible to everyone, for a suggestion with no cards */}
        {group.suggestion && !(group.suggestion_options && group.suggestion_options.length > 0) && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🍽️</span>
              <h2 className="font-bold text-gray-900 dark:text-white">{t('groupDining.suggestionTitle')}</h2>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {group.suggestion}
            </div>
          </div>
        )}
        {/* the way out, at the very end of the page: a member leaves, the leader deletes the group (each asks first) */}
        {!isCreator && !gate && (
          <button type="button" disabled={actionBusy === 'leave'} onClick={() => endGroup('leave')} className="w-full text-center text-sm text-red-500 font-medium py-2 disabled:opacity-60" data-testid="group-leave">{t('groupDining.leave')}</button>
        )}
        {isCreator && (
          <button type="button" disabled={actionBusy === 'delete'} onClick={() => endGroup('delete')} className="w-full text-center text-sm text-red-500 font-medium py-2 disabled:opacity-60" data-testid="group-delete">{t('groupDining.delete')}</button>
        )}
        {actionError && !isCreator && <p role="alert" className="text-sm text-red-500 text-center">{actionError}</p>}
      </main>
      <BottomNav />
    </div>
  )
}

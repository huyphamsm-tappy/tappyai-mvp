// Workspace v206: the one place the chat's overlay drawers (tips, entity profile) and the tips the open conversation's messages have published live.
// A single `drawer` value makes the drawers mutually exclusive by construction (opening one replaces the other). Snapshots are immutable and replaced on change
// (useSyncExternalStore); the conversation's messages publish their tips while they are on screen and take them back when they leave.

import type { EntityProfile, PlanTip } from '@/lib/chat/v206'
import type { WikiEntity } from '@/lib/chat/entityProfiles'

export type V206Drawer = { kind: 'tips' } | { kind: 'entity'; profile: EntityProfile } | { kind: 'wiki'; profile: WikiEntity } | null
export interface V206State { tips: readonly PlanTip[]; drawer: V206Drawer; tipsByMessage: ReadonlyMap<string, readonly PlanTip[]> }

let state: V206State = { tips: [], drawer: null, tipsByMessage: new Map() }
const listeners = new Set<() => void>()

function set(next: Partial<V206State>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

const sameTips = (a: readonly PlanTip[] | undefined, b: readonly PlanTip[]) => !!a && a.length === b.length && a.every((t, i) => t.id === b[i].id && t.text === b[i].text && t.title === b[i].title && t.place === b[i].place)

/** All the tips of the conversation, in message order of publication, ids made unique by their message. */
function flatten(m: ReadonlyMap<string, readonly PlanTip[]>): PlanTip[] {
  const out: PlanTip[] = []
  for (const [msg, tips] of m) for (const t of tips) out.push({ ...t, id: `${msg}:${t.id}` })
  return out
}

export const v206Store = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  getSnapshot: (): V206State => state,
  getServerSnapshot: (): V206State => state,
  publishTips(msgId: string, tips: readonly PlanTip[]) {
    if (!tips.length) { v206Store.clearTips(msgId); return }
    if (sameTips(state.tipsByMessage.get(msgId), tips)) return
    const m = new Map(state.tipsByMessage); m.set(msgId, tips)
    set({ tipsByMessage: m, tips: flatten(m) })
  },
  clearTips(msgId: string) {
    if (!state.tipsByMessage.has(msgId)) return
    const m = new Map(state.tipsByMessage); m.delete(msgId)
    // the tips drawer of a conversation that no longer has any closes with them
    set({ tipsByMessage: m, tips: flatten(m), ...(m.size === 0 && state.drawer?.kind === 'tips' ? { drawer: null } : {}) })
  },
  openTips() { if (state.tips.length) set({ drawer: { kind: 'tips' } }) },
  openEntity(profile: EntityProfile) { set({ drawer: { kind: 'entity', profile } }) },
  /** a real Wikipedia profile of a named entity (an entity chip's drawer) */
  openWiki(profile: WikiEntity) { set({ drawer: { kind: 'wiki', profile } }) },
  closeDrawer() { if (state.drawer) set({ drawer: null }) },
  /** a conversation switch: nothing of the previous one stays open or published */
  reset() { state = { tips: [], drawer: null, tipsByMessage: new Map() }; listeners.forEach(l => l()) },
}

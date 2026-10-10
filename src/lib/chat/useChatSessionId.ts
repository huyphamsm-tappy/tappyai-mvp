'use client'

import { useEffect, useState } from 'react'

// R14 / Q7: ONE `chatSessionId` per chat, sent on every turn; the server keeps the consultation state (and the agent's saved task /
// pending question) under (owner, id). The page saves the chat after the first reply and `router.replace`s /chat → /chat/<rowId>,
// which REMOUNTS ChatInterface — the remount must come back with the id turn 1 used.
//
// 🚨 Measured on the dev server (turn 1 sent f983279a…, the "pending" slot held 952d305e…, the remount adopted 952d305e…): the id
// used to be minted AND written to sessionStorage inside the useState initializer. React calls an initializer twice in development
// and keeps one result, so the id that was kept and the id that was stored were two different UUIDs → turn 2 arrived under a new id
// (new conversation_id, loaded:false), and the saved task never reached it. The initializer is now READ-ONLY; the write happens in
// an effect, from the id the component actually holds.

const PENDING = 'tappy_chat_session:pending'

const mint = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`)

/** Pure with respect to storage (reads only): the id this mount holds. Calling it twice is harmless. */
export function readChatSessionId(conversationId: string | undefined, isContinuation: boolean, mintId: () => string = mint): string {
  if (typeof window === 'undefined') return mintId()
  try {
    const own = conversationId ? localStorage.getItem(`tappy_chat_session:${conversationId}`) : null
    if (own) return own
    const pending = isContinuation ? sessionStorage.getItem(PENDING) : null
    return pending ?? mintId()
  } catch { return mintId() }
}

/** Records the held id: under the row once the chat has one, else as the pending id the post-save remount adopts. */
export function persistChatSessionId(id: string, conversationId: string | undefined): void {
  try {
    if (conversationId) { localStorage.setItem(`tappy_chat_session:${conversationId}`, id); sessionStorage.removeItem(PENDING) }
    else sessionStorage.setItem(PENDING, id)
  } catch { /* private mode: the server rebuilds from the history */ }
}

export function useChatSessionId(conversationId: string | undefined, isContinuation: boolean): string {
  const [chatSessionId] = useState<string>(() => readChatSessionId(conversationId, isContinuation))
  useEffect(() => { persistChatSessionId(chatSessionId, conversationId) }, [chatSessionId, conversationId])
  return chatSessionId
}

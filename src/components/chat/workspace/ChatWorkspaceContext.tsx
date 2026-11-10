'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ConversationStore } from './useConversationList'

// True only while a chat page is rendered inside the desktop workspace shell (flag on). On a phone, or with the flag off, nothing
// changes: the chat pages keep their own Header and BottomNav. Inside the shell, those two are hidden from `lg` up because the
// navigation rail and the history sidebar take their place.
const Ctx = createContext(false)

export const ChatWorkspaceProvider = Ctx.Provider

export function useInChatWorkspace(): boolean {
  return useContext(Ctx)
}

/** Hides its children from the desktop breakpoint up when inside the workspace; renders them untouched otherwise. */
export function HiddenInWorkspace({ children }: { children: ReactNode }) {
  const inWorkspace = useInChatWorkspace()
  if (!inWorkspace) return <>{children}</>
  return <div className="lg:hidden">{children}</div>
}

// The conversations and projects, shared by the history sidebar and the conversation header.
const StoreCtx = createContext<ConversationStore | null>(null)

export const ConversationStoreProvider = StoreCtx.Provider

export function useConversationStore(): ConversationStore {
  const store = useContext(StoreCtx)
  if (!store) throw new Error('useConversationStore must be used inside the chat workspace')
  return store
}

'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { usePathname } from 'next/navigation'
import { HISTORY_PAGE_SIZE, type HistoryConversation } from '@/lib/chat/workspace/historyModel'

// The one place the chat workspace reads the person's conversations and projects. The history sidebar and the conversation header both
// use it, so a rename or a pin shows up in both at once. GET /api/conversations is paged (newest first; `?before=` = the next page).

export type ListStatus = 'loading' | 'ready' | 'error' | 'signedOut'

export interface ChatProject {
  id: string
  title: string
  description: string | null
  conversationCount: number
  created_at?: string
  updated_at?: string
}

export interface ConversationStore {
  items: HistoryConversation[]
  setItems: Dispatch<SetStateAction<HistoryConversation[]>>
  status: ListStatus
  setStatus: Dispatch<SetStateAction<ListStatus>>
  hasMore: boolean
  loadingMore: boolean
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  projects: ChatProject[]
  setProjects: Dispatch<SetStateAction<ChatProject[]>>
  reloadProjects: () => Promise<void>
}

const time = (iso: string) => Date.parse(iso) || 0

/** A fresh first page replaces the top of the list; older pages the person already loaded stay (when the first page is full). */
export function mergeFirstPage(prev: HistoryConversation[], page: HistoryConversation[]): { items: HistoryConversation[]; keptOlder: number } {
  if (page.length < HISTORY_PAGE_SIZE) return { items: page, keptOlder: 0 }
  const ids = new Set(page.map(p => p.id))
  const oldest = Math.min(...page.map(p => time(p.updated_at)))
  const kept = prev.filter(c => !ids.has(c.id) && time(c.updated_at) < oldest)
  return { items: [...page, ...kept], keptOlder: kept.length }
}

export function useConversationList(): ConversationStore {
  const pathname = usePathname()
  const [items, setItems] = useState<HistoryConversation[]>([])
  const [status, setStatus] = useState<ListStatus>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [projects, setProjects] = useState<ChatProject[]>([])
  const itemsRef = useRef<HistoryConversation[]>([])
  const hasMoreRef = useRef(false)
  itemsRef.current = items
  hasMoreRef.current = hasMore

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (res.status === 401) {
        setItems([])
        setHasMore(false)
        setStatus('signedOut')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as HistoryConversation[]
      const page = Array.isArray(data) ? data : []
      const { items: next, keptOlder } = mergeFirstPage(itemsRef.current, page)
      setItems(next)
      setHasMore(page.length >= HISTORY_PAGE_SIZE ? (keptOlder > 0 ? hasMoreRef.current : true) : false)
      setStatus('ready')
    } catch {
      setStatus(prev => (prev === 'ready' ? prev : 'error'))
    }
  }, [])

  const loadMore = useCallback(async () => {
    const current = itemsRef.current
    if (current.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = current.reduce((min, c) => (time(c.updated_at) < time(min) ? c.updated_at : min), current[0].updated_at)
      const res = await fetch(`/api/conversations?before=${encodeURIComponent(oldest)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as HistoryConversation[]
      const page = Array.isArray(data) ? data : []
      setItems(prev => {
        const have = new Set(prev.map(c => c.id))
        return [...prev, ...page.filter(c => !have.has(c.id))]
      })
      setHasMore(page.length >= HISTORY_PAGE_SIZE)
    } catch {
      /* the button stays; pressing it again retries */
    } finally {
      setLoadingMore(false)
    }
  }, [])

  const reloadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/chat-projects', { cache: 'no-store' })
      if (!res.ok) { if (res.status === 401) setProjects([]); return }
      const body = (await res.json()) as { projects?: ChatProject[] }
      setProjects(Array.isArray(body.projects) ? body.projects : [])
    } catch {
      /* keep what is shown */
    }
  }, [])

  // Reload on arrival and whenever the route changes: a conversation saved for the first time moves /chat → /chat/<id>.
  useEffect(() => { void reload() }, [reload, pathname])
  useEffect(() => { void reloadProjects() }, [reloadProjects, pathname])

  return { items, setItems, status, setStatus, hasMore, loadingMore, reload, loadMore, projects, setProjects, reloadProjects }
}

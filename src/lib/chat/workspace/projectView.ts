// Workspace v206 project view: which project's overview the canvas shows (set when a project is opened in the sidebar's Projects tab, cleared when the person goes to a
// conversation) and the pure model of that overview (the project's own conversations as rows). Real data only: the project's title and description, its conversations with their
// real last message and update time. Nothing is invented (the mockup's goal, budget, status, saved places and dossier need data projects do not have).
import { conversationPreview } from '@/lib/chat/v206Look'
import { itemsForProject, type HistoryConversation } from '@/lib/chat/workspace/historyModel'

let current: string | null = null
const listeners = new Set<() => void>()

export const projectViewStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  getSnapshot: (): string | null => current,
  getServerSnapshot: (): string | null => null,
  /** show the overview of this project (null: back to the conversation) */
  set(id: string | null) { if (id === current) return; current = id; listeners.forEach(l => l()) },
}

export interface ProjectRow {
  id: string
  title: string | null
  category: string | null
  preview: string | null
  updated_at: string
  messages: number
  pinned: boolean
}

const count = (m: HistoryConversation['messages']) => (Array.isArray(m) ? m.filter(Boolean).length : 0)

/** The project's conversations (archived ones left out, like the other tabs), newest first, each with its real one-line preview. Pure. */
export function projectRows(items: readonly HistoryConversation[], projectId: string): ProjectRow[] {
  return itemsForProject(items, projectId)
    .filter(c => !c.is_archived)
    .map(c => ({ id: c.id, title: c.title, category: c.category ?? null, preview: conversationPreview(c.messages), updated_at: c.updated_at, messages: count(c.messages), pinned: !!c.is_pinned }))
    .sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { WorkspaceFrame } from '@/components/chat/workspace/ChatWorkspaceShell'
import type { ChatProject, ConversationStore } from '@/components/chat/workspace/useConversationList'
import type { HistoryConversation } from '@/lib/chat/workspace/historyModel'
import ChatConversation from '@/app/(app)/chat/[id]/ChatConversation'
import { projectViewStore } from '@/lib/chat/workspace/projectView'
import { rememberPlacesView } from '@/lib/recommendation/liveViewCache'
import { HARNESS_PROJECTS, HARNESS_SCENARIOS, harnessStoreItems, scenarioByParam } from '@/lib/dev/v206Harness/fixtures'
import { createHarnessFetch } from '@/lib/dev/v206Harness/harnessFetch'

// The real workspace (rail, history, toolbar, product header, project overview) and the real chat (ChatConversation -> ChatInterface), fed fixtures.
// What is NOT real here, on purpose: the conversations (a fixed list), the profiles behind the chips (fixed, see harnessFetch) and every call that costs money (refused, see harnessFetch).

declare global { interface Window { __v206HarnessFetch?: boolean } }

function installHarnessFetch(): void {
  if (typeof window === 'undefined' || window.__v206HarnessFetch) return
  window.fetch = createHarnessFetch(window.fetch.bind(window))
  window.__v206HarnessFetch = true
}

export default function HarnessClient({ scenarioParam, showBar, nowMs }: { scenarioParam?: string; showBar: boolean; nowMs: number }) {
  // before any child effect runs, so nothing the chat does at mount can reach a paid endpoint
  useState(() => { installHarnessFetch(); return null })
  const scenario = scenarioByParam(scenarioParam)
  const [items, setItems] = useState<HistoryConversation[]>(() => harnessStoreItems(nowMs))
  const [projects, setProjects] = useState<ChatProject[]>(() => [...HARNESS_PROJECTS])

  // the place cards of a conversation reach the chat the way they do across its save navigation: through the product's own in-memory hand-off
  useMemo(() => {
    const last = scenario.messages[scenario.messages.length - 1]
    if (scenario.placesView && last) rememberPlacesView(last.content, scenario.placesView)
  }, [scenario])

  useEffect(() => {
    projectViewStore.set(scenario.kind === 'project' ? scenario.projectId ?? null : null)
    return () => projectViewStore.set(null)
  }, [scenario])

  const store: ConversationStore = useMemo(() => ({
    items, setItems, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false,
    reload: async () => {}, loadMore: async () => {}, projects, setProjects, reloadProjects: async () => {},
    activeId: scenario.kind === 'chat' ? scenario.conversationId : null,
  }), [items, projects, scenario])

  const conversation = useMemo(() => ({
    id: scenario.conversationId,
    title: items.find(c => c.id === scenario.conversationId)?.title ?? scenario.label,
    category: items.find(c => c.id === scenario.conversationId)?.category ?? 'general',
    messages: scenario.messages,
  }), [scenario, items])

  return (
    <>
      <WorkspaceFrame store={store}>
        <ChatConversation key={scenario.n} conversation={conversation as never} />
      </WorkspaceFrame>
      {showBar && (
        <nav aria-label="dev test harness" data-testid="v206-harness-bar"
          className="fixed left-1/2 top-1 z-[90] flex -translate-x-1/2 items-center gap-1 rounded-full border border-amber-400/40 bg-black/80 px-2 py-0.5 font-mono text-[10px] text-amber-200">
          <span className="px-1 font-bold">DEV / v206</span>
          {HARNESS_SCENARIOS.map(s => (
            <a key={s.n} href={`/dev/v206?s=${s.n}`} data-testid={`v206-harness-tab-${s.n}`} aria-current={s.n === scenario.n ? 'page' : undefined}
              className={`rounded-full px-2 py-0.5 ${s.n === scenario.n ? 'bg-amber-400 text-black' : 'hover:bg-amber-400/20'}`}>{s.n} {s.label}</a>
          ))}
        </nav>
      )}
    </>
  )
}

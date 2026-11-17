'use client'

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { SHELL_REF } from '@/lib/chat/shellRef'
import { SHELL_SLOTS_ACTIVE } from '@/lib/chat/shellSlots'
import { ShellBackgroundSlot, ShellBannerSlot } from './ShellSlots'
import { usePathname } from 'next/navigation'
import ProjectOverview from './ProjectOverview'
import { projectViewStore } from '@/lib/chat/workspace/projectView'
import { ChatWorkspaceProvider, ConversationStoreProvider } from './ChatWorkspaceContext'
import NavRail from './NavRail'
import HistorySidebar from './HistorySidebar'
import WorkspaceToolbar from './WorkspaceToolbar'
import ProductHeader from './ProductHeader'
import { useConversationList, type ConversationStore } from './useConversationList'
import { V206_LOOK } from '@/lib/chat/v206Look'

// Desktop chat workspace: navigation rail + history sidebar + the chat itself. Behind NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED (off by
// default). With the flag off, or below the `lg` breakpoint, this renders the chat pages exactly as they were.
// With the mockup look (NEXT_PUBLIC_WORKSPACE_V206 + NEXT_PUBLIC_RESPONSE_PRESENTATION) the three columns sit under the 80 px product header.
const ENABLED = process.env.NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED === 'true'

/** NEXT_PUBLIC_SHELL_REF: the night-sky ground of the first layout, as soft light on the deep navy (a violet dusk at the lower left, a teal glow at the upper left, a blue haze behind the chat). No picture is needed. */
const SHELL_GROUND: CSSProperties = {
  backgroundImage: [
    'radial-gradient(60% 45% at 0% 100%, rgba(124, 58, 237, 0.30), transparent 70%)',
    'radial-gradient(40% 35% at 0% 0%, rgba(16, 185, 129, 0.16), transparent 70%)',
    'radial-gradient(55% 45% at 100% 0%, rgba(37, 99, 235, 0.22), transparent 70%)',
  ].join(', '),
}

export default function ChatWorkspaceShell({ children }: { children: ReactNode }) {
  if (!ENABLED) return <>{children}</>
  return <EnabledShell>{children}</EnabledShell>
}

// Separate component so the store's hooks are only ever called when the workspace is on.
function EnabledShell({ children }: { children: ReactNode }) {
  const store = useConversationList()
  const pathname = usePathname()
  // going to a conversation closes an opened project overview
  useEffect(() => { projectViewStore.set(null) }, [pathname])
  return <WorkspaceFrame store={store}>{children}</WorkspaceFrame>
}

/**
 * The workspace's drawing, given its conversation store. The production shell above feeds it the live store; the development-only test harness feeds it
 * a fixture store, so the REAL rail, history, toolbar, product header and project overview are what get compared with the mockup.
 */
export function WorkspaceFrame({ store, children }: { store: ConversationStore; children: ReactNode }) {
  // mockup look: the project opened in the sidebar shows its overview over the chat (the chat stays mounted, only hidden, so nothing of it is lost)
  const projectId = useSyncExternalStore(projectViewStore.subscribe, projectViewStore.getSnapshot, projectViewStore.getServerSnapshot)
  const overview = V206_LOOK && !!projectId
  // NEXT_PUBLIC_SHELL_REF (default off): the menu button of the first layout's header opens / closes the history panel
  const [historyOpen, setHistoryOpen] = useState(true)
  const conversation = (
    <div className={`relative min-w-0 flex-1 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border ${SHELL_REF ? 'shell-panel lg:min-h-0 lg:bg-[#0A1328]/90' : 'lg:border-blue-500/25 lg:shadow-xl lg:shadow-blue-950/70'}`}>
      {!overview && <WorkspaceToolbar />}
      {V206_LOOK && <div className={overview ? 'hidden min-h-0 flex-1 lg:block' : 'hidden'}><ProjectOverview /></div>}
      <div className={overview ? 'hidden' : 'min-h-0 flex-1'}>{children}</div>
    </div>
  )
  const columns = (
    <>
      <NavRail />
      {SHELL_REF ? <div data-shell-history className={historyOpen ? 'contents' : 'hidden'}><HistorySidebar /></div> : <HistorySidebar />}
      {/* the first layout: the banner is a panel of its own ABOVE the conversation's panel, level with the top of the history panel; the two are separate, the conversation is not shrunk inside a banner */}
      {SHELL_REF
        ? <div className="min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-3">{!overview && <ShellBannerSlot />}{conversation}</div>
        : conversation}
    </>
  )
  return (
    <ChatWorkspaceProvider value>
      <ConversationStoreProvider value={store}>
        {V206_LOOK ? (
          <div data-chat-workspace data-v206-look {...(SHELL_REF ? { 'data-shell-ref': '', style: SHELL_GROUND } : {})} className={`v3-theme dark lg:flex lg:h-dvh lg:flex-col lg:gap-3 lg:bg-[#050B18] lg:p-3${SHELL_SLOTS_ACTIVE ? ' relative isolate' : ''}`}>
            {SHELL_REF && <ShellBackgroundSlot />}
            <ProductHeader historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen(o => !o)} />
            <div className="lg:flex lg:min-h-0 lg:flex-1 lg:gap-3">{columns}</div>
          </div>
        ) : (
          <div data-chat-workspace className="v3-theme dark lg:flex lg:h-dvh lg:gap-3 lg:bg-[#050B18] lg:p-3">{columns}</div>
        )}
      </ConversationStoreProvider>
    </ChatWorkspaceProvider>
  )
}

'use client'

import type { ReactNode } from 'react'
import { ChatWorkspaceProvider, ConversationStoreProvider } from './ChatWorkspaceContext'
import NavRail from './NavRail'
import HistorySidebar from './HistorySidebar'
import WorkspaceToolbar from './WorkspaceToolbar'
import { useConversationList } from './useConversationList'

// Desktop chat workspace: navigation rail + history sidebar + the chat itself. Behind NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED (off by
// default). With the flag off, or below the `lg` breakpoint, this renders the chat pages exactly as they were.
const ENABLED = process.env.NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED === 'true'

export default function ChatWorkspaceShell({ children }: { children: ReactNode }) {
  if (!ENABLED) return <>{children}</>
  return <EnabledShell>{children}</EnabledShell>
}

// Separate component so the store's hooks are only ever called when the workspace is on.
function EnabledShell({ children }: { children: ReactNode }) {
  const store = useConversationList()
  return (
    <ChatWorkspaceProvider value>
      <ConversationStoreProvider value={store}>
        <div data-chat-workspace className="v3-theme dark lg:flex lg:h-dvh lg:gap-3 lg:bg-[#050B18] lg:p-3">
          <NavRail />
          <HistorySidebar />
          <div className="relative min-w-0 flex-1 lg:flex lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-blue-500/25 lg:shadow-xl lg:shadow-blue-950/70">
            <WorkspaceToolbar />
            <div className="min-h-0 flex-1">{children}</div>
          </div>
        </div>
      </ConversationStoreProvider>
    </ChatWorkspaceProvider>
  )
}

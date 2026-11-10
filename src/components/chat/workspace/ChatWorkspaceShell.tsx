'use client'

import type { ReactNode } from 'react'
import { ChatWorkspaceProvider } from './ChatWorkspaceContext'
import NavRail from './NavRail'
import HistorySidebar from './HistorySidebar'

// Desktop chat workspace: navigation rail + history sidebar + the chat itself. Behind NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED (off by
// default). With the flag off, or below the `lg` breakpoint, this renders the chat pages exactly as they were.
const ENABLED = process.env.NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED === 'true'

export default function ChatWorkspaceShell({ children }: { children: ReactNode }) {
  if (!ENABLED) return <>{children}</>
  return (
    <ChatWorkspaceProvider value>
      <div data-chat-workspace className="v3-theme dark lg:flex lg:h-dvh lg:gap-3 lg:bg-[#050B18] lg:p-3">
        <NavRail />
        <HistorySidebar />
        <div className="min-w-0 flex-1 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-blue-500/25 lg:shadow-xl lg:shadow-blue-950/70">{children}</div>
      </div>
    </ChatWorkspaceProvider>
  )
}

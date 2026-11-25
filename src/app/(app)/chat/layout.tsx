import type { ReactNode } from 'react'
import ChatWorkspaceShell from '@/components/chat/workspace/ChatWorkspaceShell'

// Wraps /chat and /chat/[id] in the desktop workspace (flagged; a pass-through when the flag is off).
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatWorkspaceShell>{children}</ChatWorkspaceShell>
}

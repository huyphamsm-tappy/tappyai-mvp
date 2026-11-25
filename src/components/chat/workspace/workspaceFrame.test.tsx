// @vitest-environment jsdom
// The dev test harness (/dev/v206) draws the REAL workspace (rail, history, toolbar, product header) from a fixture store, with no network and
// no route like /chat/<id>. Two things make that possible and are guarded here: WorkspaceFrame takes the store as a prop, and the store may name
// the active conversation itself (`activeId`). Without `activeId` the active conversation is still read from the URL, exactly as before.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import type { ConversationStore } from '@/components/chat/workspace/useConversationList'

let path = '/dev/v206'
vi.mock('next/navigation', () => ({
  usePathname: () => path,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))

const NOW = new Date().toISOString()
const store = (over: Partial<ConversationStore> = {}): ConversationStore => ({
  items: [
    { id: 'a', title: 'Cuộc trò chuyện A', updated_at: NOW, category: 'general', messages: [{ role: 'user', content: 'xin chào' }] },
    { id: 'b', title: 'Cuộc trò chuyện B', updated_at: NOW, category: 'general', messages: [{ role: 'user', content: 'chào' }] },
  ],
  setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {},
  projects: [], setProjects: () => {}, reloadProjects: async () => {}, ...over,
} as ConversationStore)

beforeEach(() => {
  setLocale('vi')
  path = '/dev/v206'
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetModules() })

describe('WorkspaceFrame', () => {
  it('draws the toolbar title of the store\'s own activeId, with no /chat/<id> URL and no fetch of the conversation list', async () => {
    const { WorkspaceFrame } = await import('@/components/chat/workspace/ChatWorkspaceShell')
    render(<WorkspaceFrame store={store({ activeId: 'b' })}><div data-testid="child">nội dung</div></WorkspaceFrame>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cuộc trò chuyện B')
    expect(screen.getByTestId('child')).toBeTruthy()
    const urls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.includes('/api/conversations'))).toBe(false)
  })

  it('without activeId the conversation still comes from the URL (the production behaviour is unchanged)', async () => {
    path = '/chat/a'
    const { WorkspaceFrame } = await import('@/components/chat/workspace/ChatWorkspaceShell')
    render(<WorkspaceFrame store={store()}><div /></WorkspaceFrame>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cuộc trò chuyện A')
  })

  it('an activeId that matches nothing draws the untitled header, never another conversation\'s title', async () => {
    const { WorkspaceFrame } = await import('@/components/chat/workspace/ChatWorkspaceShell')
    render(<WorkspaceFrame store={store({ activeId: 'zzz' })}><div /></WorkspaceFrame>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Cuộc trò chuyện [AB]/)
  })
})

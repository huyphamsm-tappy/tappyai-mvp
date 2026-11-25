// @vitest-environment jsdom
// The outer shell of the chat workspace in the owner's first layout (14/11/2026, NEXT_PUBLIC_SHELL_REF; reference image sent by the owner): a header with a menu button, the logo, a bell and the
// account avatar; a rail of Chat / Khám phá / Đã lưu / Inbox / Ứng dụng under a round "+" button; the history panel that the menu button opens and closes; a night-sky ground. The conversation
// inside is NOT part of this. Flag off: the shell is exactly the one of the day before. Every control goes to a destination or a store the app already has; nothing is invented.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import type { ConversationStore } from '@/components/chat/workspace/useConversationList'

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat/a',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))
let unread = 0
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ unreadCount: unread }) }))

const NOW = new Date().toISOString()
const store = (): ConversationStore => ({
  items: [{ id: 'a', title: 'Cuộc trò chuyện A', updated_at: NOW, category: 'general', messages: [{ role: 'user', content: 'xin chào' }] }],
  setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {},
  projects: [], setProjects: () => {}, reloadProjects: async () => {}, activeId: 'a',
} as ConversationStore)

async function frame(shellRef: boolean) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', '1')
  vi.stubEnv('NEXT_PUBLIC_RESPONSE_PRESENTATION', '1')
  vi.stubEnv('NEXT_PUBLIC_SHELL_REF', shellRef ? '1' : '0')
  const { WorkspaceFrame } = await import('@/components/chat/workspace/ChatWorkspaceShell')
  return render(<WorkspaceFrame store={store()}><div data-testid="child">nội dung</div></WorkspaceFrame>)
}

beforeEach(() => {
  setLocale('vi'); unread = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/api/profile') ? new Response(JSON.stringify({ full_name: 'Huy', avatar_url: '' }), { status: 200 }) : new Response('{}', { status: 401 }))))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('NEXT_PUBLIC_SHELL_REF · the header', () => {
  it('has a menu button, the logo to home, a bell to the notifications and the account avatar to the profile; no tagline', async () => {
    const { container } = await frame(true)
    const header = container.querySelector('[data-testid="v206-product-header"]') as HTMLElement
    expect(header).toBeTruthy()
    expect(header.querySelector('button[aria-label]')).toBeTruthy()
    expect((header.querySelector('a[href="/"]') as HTMLElement).textContent).toContain('TappyAI')
    expect(header.querySelector('a[href="/profile/notifications"]')).toBeTruthy()
    expect(header.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(header.textContent).not.toContain('Trợ lý Trí tuệ Toàn diện')
  })
  it('the bell shows a red dot only when there is something unread', async () => {
    unread = 0
    const a = await frame(true)
    expect(a.container.querySelector('[data-testid="shell-bell-dot"]')).toBeNull()
    cleanup()
    unread = 3
    const b = await frame(true)
    expect(b.container.querySelector('[data-testid="shell-bell-dot"]')).toBeTruthy()
  })
  it('the avatar is the person\'s real profile: with no picture it is the initial of the real name', async () => {
    const { container } = await frame(true)
    await waitFor(() => expect((container.querySelector('a[href="/profile"]') as HTMLElement).textContent).toContain('H'))
  })
  it('the menu button closes and reopens the history panel', async () => {
    const { container } = await frame(true)
    const panel = () => container.querySelector('[data-shell-history]') as HTMLElement
    expect(panel().className).not.toContain('hidden')
    const btn = container.querySelector('[data-testid="v206-product-header"] button[aria-label]') as HTMLButtonElement
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(btn)
    expect(panel().className).toContain('hidden')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(panel().className).not.toContain('hidden')
  })
})

describe('NEXT_PUBLIC_SHELL_REF · the rail', () => {
  it('Chat, Khám phá, Đã lưu, Inbox, Ứng dụng in that order, under the round create button; the saved button and the create link keep their test ids', async () => {
    const { container } = await frame(true)
    const rail = container.querySelector('nav') as HTMLElement
    const labels = [...rail.querySelectorAll('[data-rail-item]')].map(e => e.textContent?.trim())
    expect(labels).toEqual(['Chat', 'Khám phá', 'Đã lưu', 'Inbox', 'Ứng dụng'])
    expect(rail.querySelector('a[data-rail-item][href="/chat"]')).toBeTruthy()
    expect(rail.querySelector('a[data-rail-item][href="/reviews"]')).toBeTruthy()
    expect(rail.querySelector('a[data-rail-item][href="/profile/notifications"]')).toBeTruthy()
    expect(rail.querySelector('a[data-rail-item][href="/tools"]')).toBeTruthy()
    expect(rail.querySelector('[data-testid="rail-saved"]')).toBeTruthy()
    expect(rail.querySelector('[data-testid="rail-create"]')?.getAttribute('href')).toBe('/chat')
    expect(rail.textContent).not.toContain('Deal')
    expect(rail.textContent).not.toContain('Trang chủ')
  })
})

describe('NEXT_PUBLIC_SHELL_REF · the ground and the old shell', () => {
  it('the frame carries the night-sky ground marker and no blue-edged panels', async () => {
    const { container } = await frame(true)
    const root = container.querySelector('[data-chat-workspace]') as HTMLElement
    expect(root.hasAttribute('data-shell-ref')).toBe(true)
    expect(container.querySelector('nav')!.className).not.toContain('border-blue-500/25')
  })
  it('14/11 (owner: "trong mockup conversation là 1 khối"): the conversation is ONE surface: the panel has the background, the header is a row of it with no bar and no line of its own; flag OFF keeps the old header bar', async () => {
    const on = await frame(true)
    const panel = on.container.querySelector('[data-testid="child"]')!.parentElement!.parentElement as HTMLElement
    expect(panel.className).toContain('lg:bg-[#0A1328]')
    const header = panel.firstElementChild as HTMLElement
    expect(header.className).not.toContain('border-b')
    expect(header.className).not.toContain('bg-[#091022]')
    expect(header.className).toContain('bg-transparent')
    cleanup()
    const off = await frame(false)
    const oldPanel = off.container.querySelector('[data-testid="child"]')!.parentElement!.parentElement as HTMLElement
    expect(oldPanel.className).not.toContain('lg:bg-[#0A1328]')
    expect((oldPanel.firstElementChild as HTMLElement).className).toContain('border-b')
  })
  it('14/11 (the owner\'s second reference): the header is a row on the ground, no card, indented past the rail so the menu and the logo sit over the history panel; the rail and the history are floating panels with a shadow, the rail shorter and set a little lower than the history', async () => {
    const { container } = await frame(true)
    const header = container.querySelector('[data-testid="v206-product-header"]') as HTMLElement
    expect(header.className).toContain('pl-[120px]')
    expect(header.className).not.toMatch(/\bborder\b|bg-\[#091022\]|shadow/)
    const rail = container.querySelector('nav') as HTMLElement
    expect(rail.className).toContain('shell-panel')
    expect(rail.className).toContain('self-start')
    expect(rail.className).toContain('lg:mt-3')
    const history = container.querySelector('[data-shell-history] aside') as HTMLElement
    expect(history.className).toContain('shell-panel')
    expect(history.className).not.toContain('self-start') // the history runs the full height
  })
  it('flag OFF: the shell is the old one (tagline, Deal and Trang chủ in the rail, no menu button, no marker)', async () => {
    const { container } = await frame(false)
    const root = container.querySelector('[data-chat-workspace]') as HTMLElement
    expect(root.hasAttribute('data-shell-ref')).toBe(false)
    expect(container.querySelector('[data-testid="v206-product-header"]')!.textContent).toContain('Trợ lý Trí tuệ Toàn diện')
    expect(container.querySelector('[data-testid="v206-product-header"] button')).toBeNull()
    const rail = container.querySelector('nav') as HTMLElement
    expect(rail.textContent).toContain('Deal')
    expect(rail.textContent).toContain('Trang chủ')
    expect(container.querySelector('[data-shell-history]')).toBeNull()
  })
  it('the conversation inside is untouched in both', async () => {
    for (const on of [true, false]) {
      const { container } = await frame(on)
      expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('nội dung')
      cleanup()
    }
  })
})

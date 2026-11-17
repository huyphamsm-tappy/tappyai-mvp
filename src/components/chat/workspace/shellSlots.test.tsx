// @vitest-environment jsdom
// The reserved places for the banner and the background (14/11/2026, owner: "vẽ khung và code vị trí trước thôi"): nothing is drawn until told to; the frame shows the position and size; a picture goes in
// the place when its address is given; only this site's own paths and https addresses ever become an image.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import type { ConversationStore } from '@/components/chat/workspace/useConversationList'
import { slotImageUrl, bannerFrom, backgroundFrom, BANNER_SIZE, BANNER_ART, BANNER_HREF, DEFAULT_BANNER, DEFAULT_BACKGROUND } from '@/lib/chat/shellSlots'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat/a',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))

const store = (): ConversationStore => ({
  items: [], setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {},
  projects: [], setProjects: () => {}, reloadProjects: async () => {}, activeId: null,
} as unknown as ConversationStore)

async function frame(env: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', '1')
  vi.stubEnv('NEXT_PUBLIC_RESPONSE_PRESENTATION', '1')
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const { WorkspaceFrame } = await import('@/components/chat/workspace/ChatWorkspaceShell')
  return render(<WorkspaceFrame store={store()}><div data-testid="child">nội dung</div></WorkspaceFrame>)
}

beforeEach(() => {
  setLocale('vi')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

const ref = { NEXT_PUBLIC_SHELL_REF: '1' }

describe('slotImageUrl', () => {
  it('accepts a path of this site and an https address only', () => {
    expect(slotImageUrl('/banners/a.webp')).toBe('/banners/a.webp')
    expect(slotImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    for (const bad of [undefined, '', '   ', 'javascript:alert(1)', 'http://x.com/a.png', 'data:image/png;base64,AAAA', '//evil.com/a.png', '/a b.png', '/a".png', "/a'.png", '/a).png', 'https://', 'ftp://x/a.png', 'a.png', `/${'a'.repeat(600)}`]) {
      expect(slotImageUrl(bad as string | undefined), String(bad).slice(0, 30)).toBeNull()
    }
  })
})

describe('bannerFrom', () => {
  it('unset or empty is the default, "off" is none, a safe address is itself, an unsafe one is none (it never falls back to the default)', () => {
    expect(bannerFrom(undefined)).toBe(DEFAULT_BANNER)
    expect(bannerFrom('   ')).toBe(DEFAULT_BANNER)
    expect(bannerFrom('OFF')).toBeNull()
    expect(bannerFrom('/banners/x.webp')).toBe('/banners/x.webp')
    expect(bannerFrom('javascript:alert(1)')).toBeNull()
    expect(bannerFrom('http://x.com/a.png')).toBeNull()
  })
})

describe('backgroundFrom', () => {
  it('unset or empty is the owner\'s background, "off" is none, a safe address is itself, an unsafe one is none', () => {
    expect(backgroundFrom(undefined)).toBe(DEFAULT_BACKGROUND)
    expect(backgroundFrom('  ')).toBe(DEFAULT_BACKGROUND)
    expect(backgroundFrom('off')).toBeNull()
    expect(backgroundFrom('OFF')).toBeNull()
    expect(backgroundFrom('/backgrounds/x.webp')).toBe('/backgrounds/x.webp')
    expect(backgroundFrom('https://cdn.example.com/bg.jpg')).toBe('https://cdn.example.com/bg.jpg')
    expect(backgroundFrom('javascript:alert(1)')).toBeNull()
    expect(backgroundFrom('http://x.com/a.png')).toBeNull()
  })
  it('the background file the owner gave (15/11, Hồ Gươm at dusk) is in the public folder: a WebP at least 1600 px wide, under 600 KB (it loads on every chat page)', () => {
    const file = join(process.cwd(), 'public', DEFAULT_BACKGROUND)
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBeLessThan(600_000)
    const b = require('node:fs').readFileSync(file) as Buffer
    expect(b.toString('ascii', 0, 4)).toBe('RIFF')
    expect(b.toString('ascii', 8, 12)).toBe('WEBP')
    const chunk = b.toString('ascii', 12, 16)
    const width = chunk === 'VP8X' ? 1 + (b[24] | (b[25] << 8) | (b[26] << 16)) : chunk === 'VP8 ' ? (b[26] | (b[27] << 8)) & 0x3fff : ((b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) & 0x3fff) + 1
    expect(width).toBeGreaterThanOrEqual(1600)
  })
})

describe('the slots', () => {
  it('14/11 and 15/11 (the owner gave the banner and the background): nothing set = the owner\'s banner and background in their places, no dashed frame', async () => {
    const { container } = await frame(ref)
    const img = container.querySelector('[data-shell-banner] img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(DEFAULT_BANNER)
    expect(img.getAttribute('src')).toBe('/banners/shell-banner.webp')
    expect(container.querySelector('[data-shell-banner]')!.innerHTML).not.toContain('border-dashed')
    const bg = container.querySelector('[data-shell-background] > div') as HTMLElement
    expect(bg.style.backgroundImage).toContain(DEFAULT_BACKGROUND)
    expect(DEFAULT_BACKGROUND).toBe('/backgrounds/shell-background.webp')
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('nội dung')
  })
  it('15/11 (owner: "đưa vào nó bị thế này"): WITH a picture the frame takes the column\'s width and the picture\'s OWN height, no border and no fixed ratio, so the picture fills it edge to edge and no bar can appear at its sides', async () => {
    const { container } = await frame(ref)
    const box = container.querySelector('[data-shell-banner]') as HTMLElement
    expect(box.style.aspectRatio).toBe('') // no fixed ratio to disagree with the art (a fixed ratio + a 1 px border letterboxed the owner's art by 12-14 px a side)
    expect(box.style.height).toBe('')
    expect(box.className).toContain('shell-panel-art') // the lift without a border
    expect(box.className).not.toMatch(/\bshell-panel\b(?!-)/)
    const img = box.querySelector('img') as HTMLImageElement
    expect(img.className).toContain('w-full')
    expect(img.className).toContain('h-auto')
    expect(img.className).not.toMatch(/object-(contain|cover)|\bh-full\b/)
  })
  it('without a picture the dashed placeholder keeps the reference proportions (1600 : 150)', async () => {
    const { container } = await frame({ ...ref, NEXT_PUBLIC_SHELL_SLOTS: '1', NEXT_PUBLIC_SHELL_BANNER_IMAGE: 'off' })
    const box = container.querySelector('[data-shell-banner]') as HTMLElement
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe(`${BANNER_SIZE.width}/${BANNER_SIZE.height}`)
  })
  it('"off" removes the banner and the background: the conversation gets its full height back, and the root is what it was', async () => {
    const { container } = await frame({ ...ref, NEXT_PUBLIC_SHELL_BANNER_IMAGE: 'off', NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE: 'off' })
    expect(container.querySelector('[data-shell-banner]')).toBeNull()
    expect(container.querySelector('[data-shell-background]')).toBeNull()
    expect(container.querySelector('[data-chat-workspace]')!.className).not.toContain('isolate')
  })
  it('the banner file the owner gave is in the public folder, a WebP that is a wide band (the frame follows its own height, so any sane band ratio fits); its top edge is not a white line', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const webp = readFileSync(join(process.cwd(), 'public', 'banners', 'shell-banner.webp'))
    expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP')
    const kind = webp.subarray(12, 16).toString('latin1')
    // VP8X (extended): the canvas size is stored minus one, 24 bits each, little-endian; "VP8 " (lossy): 14 bits each after the frame tag and the start code
    const [width, height] = kind === 'VP8X'
      ? [1 + (webp[24] | (webp[25] << 8) | (webp[26] << 16)), 1 + (webp[27] | (webp[28] << 8) | (webp[29] << 16))]
      : kind === 'VP8 ' ? [(webp[26] | (webp[27] << 8)) & 0x3fff, (webp[28] | (webp[29] << 8)) & 0x3fff] : [0, 0]
    expect(width).toBeGreaterThanOrEqual(1600)
    expect(width / height).toBeGreaterThan(8)
    expect(width / height).toBeLessThan(14)
    expect(webp.length).toBeLessThan(400 * 1024)
    expect(BANNER_ART.width / BANNER_ART.height).toBeCloseTo(BANNER_SIZE.width / BANNER_SIZE.height, 5) // the size recommended for new art is the same shape as the placeholder
  })
  it('15/11 (owner: "click vào banner chuyển qua mục khám phá"): the whole picture is ONE link to Khám phá, the rail\'s own destination, named by it', async () => {
    const { container } = await frame(ref)
    const link = container.querySelector('[data-shell-banner] a[data-testid="shell-banner-link"]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(BANNER_HREF)
    expect(BANNER_HREF).toBe('/reviews')
    expect(link.getAttribute('aria-label')).toBe('Khám phá')
    expect(link.querySelector('img')).toBeTruthy()
    // the rail's Khám phá goes to the same place
    expect(container.querySelector('nav a[href="/reviews"]')).toBeTruthy()
    // the dashed frame (no picture) is not a link
    cleanup()
    const framed = await frame({ ...ref, NEXT_PUBLIC_SHELL_SLOTS: '1', NEXT_PUBLIC_SHELL_BANNER_IMAGE: 'off' })
    expect(framed.container.querySelector('[data-shell-banner] a')).toBeNull()
  })
  it('frame flag: both places drawn as dashed frames, with the banner size, in the right place; the chat is untouched', async () => {
    const { container } = await frame({ ...ref, NEXT_PUBLIC_SHELL_SLOTS: '1', NEXT_PUBLIC_SHELL_BANNER_IMAGE: 'off' })
    const banner = container.querySelector('[data-shell-banner]') as HTMLElement
    const bg = container.querySelector('[data-shell-background]') as HTMLElement
    expect(banner.textContent).toContain(`${BANNER_ART.width} x ${BANNER_ART.height}`)
    expect(banner.innerHTML).toContain('border-dashed')
    expect(bg.innerHTML).toContain('border-dashed')
    const root = container.querySelector('[data-chat-workspace]') as HTMLElement
    expect(root.className).toContain('isolate')
    expect(root.firstElementChild).toBe(bg) // behind everything: the first child of the isolated root
    expect(bg.className).toContain('-z-10')
    // the owner's reference: the banner is a panel of its own ABOVE the conversation's panel, in the same right-hand column, not a band inside the conversation
    const child = container.querySelector('[data-testid="child"]') as HTMLElement
    const col = banner.parentElement as HTMLElement
    const conversation = [...col.children].find(c => c !== banner) as HTMLElement
    expect(conversation.contains(child)).toBe(true)
    expect(banner.contains(child)).toBe(false)
    expect(conversation.contains(banner)).toBe(false)
    expect(banner.nextElementSibling).toBe(conversation)
    expect(banner.className).toContain('rounded-2xl') // a separate rounded panel like the others
    expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('nội dung')
  })
  it('a banner picture and a background picture go in their places, no frame', async () => {
    const { container } = await frame({ ...ref, NEXT_PUBLIC_SHELL_BANNER_IMAGE: '/banners/a.webp', NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE: 'https://cdn.example.com/bg.jpg' })
    const img = container.querySelector('[data-shell-banner] img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/banners/a.webp')
    expect(img.getAttribute('alt')).toBe('')
    expect(container.querySelector('[data-shell-banner]')!.innerHTML).not.toContain('border-dashed')
    expect((container.querySelector('[data-shell-background] > div') as HTMLElement).style.backgroundImage).toContain('https://cdn.example.com/bg.jpg')
  })
  it('an address that is not safe draws nothing', async () => {
    const { container } = await frame({ ...ref, NEXT_PUBLIC_SHELL_BANNER_IMAGE: 'javascript:alert(1)', NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE: 'http://x.com/a.png' })
    expect(container.querySelector('[data-shell-banner]')).toBeNull()
    expect(container.querySelector('[data-shell-background]')).toBeNull()
  })
  it('without the first layout (SHELL_REF off) none of it exists, whatever else is set', async () => {
    const { container } = await frame({ NEXT_PUBLIC_SHELL_REF: '0', NEXT_PUBLIC_SHELL_SLOTS: '1', NEXT_PUBLIC_SHELL_BANNER_IMAGE: '/b.webp', NEXT_PUBLIC_SHELL_BACKGROUND_IMAGE: '/g.webp' })
    expect(container.querySelector('[data-shell-banner]')).toBeNull()
    expect(container.querySelector('[data-shell-background]')).toBeNull()
    expect(container.querySelector('[data-chat-workspace]')!.className).not.toContain('isolate')
  })
})

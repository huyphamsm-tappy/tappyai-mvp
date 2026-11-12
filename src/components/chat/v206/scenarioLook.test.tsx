// @vitest-environment jsdom
// The mockup's look for the same KIND of answer, built from the answer's own text: mono caps numbered section headings, a table as a titled data box (no verification badge),
// the dossier cover and "01." headings of the opened full report (no "Gate PASS", no invented byline names), and the project overview from the project's real conversations.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, within, act } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import { ArticleAnswer, dataBoxTitle } from '@/components/chat/ArticleAnswer'
import ProjectOverview from '@/components/chat/workspace/ProjectOverview'
import { ConversationStoreProvider } from '@/components/chat/workspace/ChatWorkspaceContext'
import type { ConversationStore } from '@/components/chat/workspace/useConversationList'
import { projectViewStore } from '@/lib/chat/workspace/projectView'

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }))

beforeEach(() => { setLocale('vi'); projectViewStore.set(null) })
afterEach(() => { cleanup(); projectViewStore.set(null); vi.unstubAllEnvs(); vi.resetModules() })

const answer = (text: string, look = true) => render(<ArticleAnswer text={text} images={[]} format={formatMessage} presentation={{ variant: 'editorial', look }} />)

describe('editorial look', () => {
  const TEXT = 'Mở đầu.\n\n## So sánh thành tích\n\nNội dung.\n\n## Kết luận\n\nHết.'
  it('numbers unnumbered level-2 headings 1., 2. in mono caps style (two or more of them)', () => {
    const { container } = answer(TEXT)
    const heads = Array.from(container.querySelectorAll('h2.v206-h'))
    expect(heads.map(h => h.querySelector('.v206-hnum')?.textContent)).toEqual(['1.', '2.'])
    expect(container.querySelector('[data-answer="article"]')!.className).toContain('v206-ed')
  })
  it('adds no number to a single heading, nor to a heading that has its own number', () => {
    expect(answer('x\n\n## Chỉ một mục\n\ny').container.querySelectorAll('.v206-hnum')).toHaveLength(0)
    cleanup()
    const { container } = answer('## 1. Một\n\na\n\n## 2. Hai\n\nb')
    expect(container.querySelectorAll('.v206-hnum')).toHaveLength(0)
    expect(container.querySelectorAll('h2.v206-h')).toHaveLength(2)
  })
  it('look off: the former layout, untouched', () => {
    const { container } = answer(TEXT, false)
    expect(container.querySelector('.v206-h')).toBeNull()
    expect(container.querySelector('.v206-hnum')).toBeNull()
    expect(container.querySelector('.v206-ed')).toBeNull()
    expect(container.querySelector('[data-testid="v206-databox"]')).toBeNull()
  })

  const TABLE = 'Bảng so sánh nhanh:\n\n| Khía cạnh | Elon | Sam |\n| --- | --- | --- |\n| Vốn | Cổ phiếu | Liên minh |'
  it('a table is a data box with the title the answer wrote right before it; never a verification badge', () => {
    const { container } = answer(TABLE)
    const box = container.querySelector('[data-testid="v206-databox"]')!
    expect(box).toBeTruthy()
    expect(box.querySelector('.v206-databox-title')!.textContent).toBe('Bảng so sánh nhanh')
    expect(box.querySelector('table')).toBeTruthy()
    expect(container.textContent).not.toMatch(/verifying|status: active|verified|đã xác minh/i)
  })
  it('no title when nothing introduces the table (a heading is its own title; no title is made up)', () => {
    const { container } = answer('## Bảng\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')
    const box = container.querySelector('[data-testid="v206-databox"]')!
    expect(box.querySelector('.v206-databox-title')).toBeNull()
    expect(dataBoxTitle(undefined)).toBeNull()
    expect(dataBoxTitle({ t: 'para', text: 'Một câu dài không phải lời dẫn.' })).toBeNull()
    expect(dataBoxTitle({ t: 'para', text: 'So sánh:' })).toBe('So sánh')
  })
})

describe('dossier (the opened full report, flag on)', () => {
  const REPORT = '# Báo cáo Phú Quốc\n\n## Tóm tắt\n\nNội dung một.\n\n## So sánh\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n## 3. Đã có số\n\nHết.\n\n## Nguồn\n\n1. Trang một — site1.vn\n2. Trang hai — site2.vn\n'
  it('shows the DEEP_RESEARCH DOSSIER label, a byline without invented names, "01." headings and no verification claim', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_WORKSPACE_V206', '1')
    const { default: Canvas } = await import('@/components/chat/ResearchCanvas')
    const { formatMessage: fm } = await import('@/components/ChatInterface')
    const { container } = render(<Canvas msgId="m1" text={REPORT} streaming={false} format={fm} research={{ phase: 'done', title: 'Báo cáo Phú Quốc', links: [] } as never} />)
    expect(screen.getByTestId('dossier-kind').textContent).toBe('DEEP_RESEARCH DOSSIER')
    expect(screen.getByTestId('dossier-byline').textContent).toMatch(/^Biên soạn bởi TappyAI Deep Research · /)
    const nums = Array.from(container.querySelectorAll('h2 .v206-hnum')).map(n => n.textContent)
    // the heading that has its own number and the sources list get none
    expect(nums).toEqual(['01.', '02.'])
    expect(container.textContent).not.toMatch(/Luna|Gate|PASS|verified|xác minh|EVIDENCE/i)
    expect(container.querySelector('[data-testid="v206-databox"]')).toBeTruthy()
  })
})

describe('project overview', () => {
  const store = (over: Partial<ConversationStore> = {}): ConversationStore => ({
    items: [
      { id: 'a', title: 'Lịch Phú Quốc', updated_at: new Date().toISOString(), project_id: 'p1', category: 'travel', messages: [{ role: 'assistant', content: 'Nên đi **tháng 12**.' }] },
      { id: 'z', title: 'Việc khác', updated_at: new Date().toISOString(), project_id: 'p9' },
    ],
    setItems: () => {}, status: 'ready', setStatus: () => {}, hasMore: false, loadingMore: false, reload: async () => {}, loadMore: async () => {},
    projects: [{ id: 'p1', title: 'Du lịch Phú Quốc 2026', description: 'Chuyến đi gia đình', conversationCount: 1 }, { id: 'p2', title: 'Trống', description: null, conversationCount: 0 }, { id: 'p3', title: 'Rỗng', description: null, conversationCount: 0 }],
    setProjects: () => {}, reloadProjects: async () => {}, ...over,
  } as ConversationStore)
  const view = (id: string | null, s = store()) => { projectViewStore.set(id); return render(<ConversationStoreProvider value={s}><ProjectOverview /></ConversationStoreProvider>) }

  it('draws nothing when no project is open', () => { expect(view(null).container.innerHTML).toBe('') })

  it('header with the real title, description and count; the project\'s conversations as rows with preview and time', () => {
    view('p1')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Du lịch Phú Quốc 2026')
    expect(screen.getByTestId('project-overview-desc').textContent).toBe('Chuyến đi gia đình')
    const rows = screen.getAllByTestId('project-overview-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].getAttribute('href')).toBe('/chat/a')
    expect(within(rows[0]).getByTestId('project-overview-preview').textContent).toBe('Nên đi tháng 12.')
    expect(rows[0].textContent).toContain('Lịch Phú Quốc')
  })

  it('no description line when the project has none; no invented goal, budget or status', () => {
    const { container } = view('p3')
    expect(screen.queryByTestId('project-overview-desc')).toBeNull()
    expect(container.textContent).not.toMatch(/ngân sách|trạng thái|mục tiêu|Dossier|đã lưu/i)
  })

  it('an empty project shows the empty state', () => {
    view('p2')
    expect(screen.getByTestId('project-overview-empty').textContent).toContain('chưa có cuộc trò chuyện')
    expect(screen.queryAllByTestId('project-overview-row')).toHaveLength(0)
  })

  it('the back button and a click on a row close the overview', () => {
    view('p1')
    act(() => { screen.getByTestId('project-overview-back').click() })
    expect(projectViewStore.getSnapshot()).toBeNull()
    cleanup()
    view('p1')
    act(() => { screen.getAllByTestId('project-overview-row')[0].click() })
    expect(projectViewStore.getSnapshot()).toBeNull()
  })
})

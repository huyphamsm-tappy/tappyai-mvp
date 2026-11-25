// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { AiConsentDialog } from './AiConsentDialog'
import { VideoFlowPanel } from './VideoFlowPanel'
import { VideoDownloadButton } from './VideoDownloadButton'
import { VideoOverlayPanel, type OverlaySaveHandle } from './VideoOverlayPanel'
import { INITIAL_FLOW, type FlowState } from '@/lib/media/video/composerState'
import { translate } from '@/lib/i18n/useTranslation'
import { vi as videoVi, en as videoEn } from '@/lib/i18n/video'

afterEach(cleanup)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('video dictionary', () => {
  it('has the same keys in both languages, none empty, all prefixed video.', () => {
    expect(Object.keys(videoEn).sort()).toEqual(Object.keys(videoVi).sort())
    for (const [k, v] of [...Object.entries(videoVi), ...Object.entries(videoEn)]) { expect(k.startsWith('video.')).toBe(true); expect(v.trim()).not.toBe('') }
  })
  it('carries the owner-approved consent wording exactly', () => {
    expect(videoVi['video.consent.body']).toBe('Để đăng clip lên Khám phá, TappyAI sẽ gửi hình ảnh (một số khung hình), lời nói và chữ trong clip đến nhà cung cấp trí tuệ nhân tạo (hiện là OpenAI) chỉ để kiểm duyệt trước khi đăng. Nếu không đồng ý, bạn vẫn xem được video nhưng không đăng được clip. Video gốc được lưu riêng tư; bạn có thể xoá bài hoặc tài khoản bất cứ lúc nào để xoá video.')
    expect(videoEn['video.consent.body']).toBe('To post a clip to Explore, TappyAI sends some frames, the speech and the on-screen text of your clip to an AI provider (currently OpenAI) solely to review it before it is published. If you decline you can still watch videos but cannot post a clip. Your original video is stored privately; you can delete the post or your account at any time to remove the video.')
  })
  it('is reachable through translate() in both languages', () => {
    expect(translate('en', 'video.download.button')).toBe('Download')
    expect(translate('vi', 'video.download.button')).toBe('Tải về')
  })
})

describe('AiConsentDialog', () => {
  it('shows the approved text and calls accept / decline', () => {
    const onAccept = vi.fn(); const onDecline = vi.fn()
    render(<AiConsentDialog onAccept={onAccept} onDecline={onDecline} />)
    expect(screen.getByRole('dialog').textContent).toContain('chỉ để kiểm duyệt trước khi đăng')
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    fireEvent.click(screen.getByRole('button', { name: 'Không đồng ý' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })
  it('disables both buttons while saving and shows the failure', () => {
    render(<AiConsentDialog onAccept={() => {}} onDecline={() => {}} busy failed />)
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

describe('VideoFlowPanel', () => {
  const noop = () => {}
  const panel = (state: FlowState, extra: Partial<Parameters<typeof VideoFlowPanel>[0]> = {}) =>
    render(<VideoFlowPanel state={state} onCancel={noop} onRetry={noop} onRemove={noop} onAcceptConsent={noop} onDeclineConsent={noop} {...extra} />)

  it('idle shows nothing, or the calm notice after declining', () => {
    const { container, unmount } = panel(INITIAL_FLOW)
    expect(container.textContent).toBe('')
    unmount()
    panel({ ...INITIAL_FLOW, consentDeclined: true })
    expect(screen.getByRole('status').textContent).toContain('chưa đồng ý')
  })
  it('uploading shows the percentage and cancel works', () => {
    const onCancel = vi.fn()
    panel({ ...INITIAL_FLOW, phase: 'uploading', progress: 37 }, { onCancel })
    expect(screen.getByText('37%')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37')
    fireEvent.click(screen.getByRole('button', { name: /Hủy/ }))
    expect(onCancel).toHaveBeenCalled()
  })
  it.each([
    ['processing', 'Đang xử lý'],
    ['review', 'Đang chờ duyệt'],
    ['ready', 'Sẵn sàng đăng'],
    ['published', 'Đã đăng'],
    ['rejected', 'Clip này không được đăng'],
    ['failed', 'Xử lý clip chưa thành công'],
  ] as const)('%s shows "%s"', (phase, text) => {
    panel({ ...INITIAL_FLOW, phase })
    expect(screen.getByText(text)).toBeTruthy()
  })
  it('an error shows its localized message and offers retry only when a retry can help', () => {
    const onRetry = vi.fn()
    const { unmount } = panel({ ...INITIAL_FLOW, phase: 'error', error: 'network' }, { onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalled()
    unmount()
    panel({ ...INITIAL_FLOW, phase: 'error', error: 'tooLong' })
    expect(screen.getByText(/dài quá 5 phút/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })
  it('every error key has a message in the dictionary', () => {
    for (const k of ['tooLarge', 'type', 'tooLong', 'unreadable', 'metadata', 'rate', 'unavailable', 'failed', 'login', 'network', 'generic']) {
      expect(videoVi[`video.err.${k}`]).toBeTruthy(); expect(videoEn[`video.err.${k}`]).toBeTruthy()
    }
  })
  it('the consent phase opens the dialog', () => {
    panel({ ...INITIAL_FLOW, phase: 'consent' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('VideoDownloadButton', () => {
  it('POST, poll until ready, then starts the file download once', async () => {
    const calls: string[] = []
    const answers = [json(200, { status: 'rendering' }), json(200, { status: 'rendering' }), json(200, { status: 'ready' })]
    const fetchImpl = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => { calls.push(`${init?.method ?? 'GET'} ${String(u)}`); return answers.shift()! }) as unknown as typeof fetch
    const startFile = vi.fn()
    render(<VideoDownloadButton assetId="abc" deps={{ fetchImpl, pollMs: 5, startFile }} />)
    fireEvent.click(screen.getByRole('button', { name: /Tải về/ }))
    expect(await screen.findByText(/Đang tạo bản tải về/)).toBeTruthy()
    await waitFor(() => expect(startFile).toHaveBeenCalledTimes(1))
    expect(startFile).toHaveBeenCalledWith('/api/video/uploads/abc/download?file=1')
    expect(calls).toEqual(['POST /api/video/uploads/abc/download', 'GET /api/video/uploads/abc/download', 'GET /api/video/uploads/abc/download'])
  })
  it('a ready file answer starts the download without polling', async () => {
    const fetchImpl = vi.fn(async () => json(200, { status: 'ready' })) as unknown as typeof fetch
    const startFile = vi.fn()
    render(<VideoDownloadButton assetId="abc" deps={{ fetchImpl, pollMs: 5, startFile }} />)
    fireEvent.click(screen.getByRole('button', { name: /Tải về/ }))
    await waitFor(() => expect(startFile).toHaveBeenCalledTimes(1))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it.each([
    [409, { error: 'not_ready' }, /chưa sẵn sàng để tải/],
    [422, { error: 'overlay_invalid' }, /chưa hợp lệ/],
    [503, { error: 'download_unavailable' }, /tạm thời chưa dùng được/],
    [200, { status: 'failed' }, /Không tạo được bản tải/],
  ])('POST %s shows the matching message', async (status, body, text) => {
    const fetchImpl = vi.fn(async () => json(status, body)) as unknown as typeof fetch
    render(<VideoDownloadButton assetId="abc" deps={{ fetchImpl, pollMs: 5, startFile: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: /Tải về/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(text)
  })
  it('stops polling when unmounted', async () => {
    let gets = 0
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => { if (init?.method !== 'POST') gets++; return json(200, { status: 'rendering' }) }) as unknown as typeof fetch
    const { unmount } = render(<VideoDownloadButton assetId="abc" deps={{ fetchImpl, pollMs: 5, startFile: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: /Tải về/ }))
    await waitFor(() => expect(gets).toBeGreaterThan(1))
    unmount()
    const after = gets
    await new Promise(r => setTimeout(r, 50))
    expect(gets).toBeLessThanOrEqual(after + 1)
  })
})

describe('VideoOverlayPanel', () => {
  const emptyDoc = { schema_version: 1, layers: [] }
  function setup(puts: Response[] = []) {
    const calls: { method: string; body?: string }[] = []
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined })
      if (!init?.method) return json(200, { version: 3, doc: emptyDoc })
      return puts.shift() ?? json(200, { version: 4 })
    }) as unknown as typeof fetch
    const handleRef = { current: null as OverlaySaveHandle | null }
    render(<VideoOverlayPanel assetId="abc" previewUrl="blob:x" durationMs={5000} handleRef={handleRef} fetchImpl={fetchImpl} />)
    return { calls, handleRef }
  }

  it('loads the saved draft, lets the author add text, and saves it with the loaded version', async () => {
    const { calls, handleRef } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /Thêm chữ/ }))
    expect(handleRef.current?.dirty()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chữ' }))
    expect(await screen.findByText('Đã lưu')).toBeTruthy()
    const put = calls.find(c => c.method === 'PUT')!
    expect(JSON.parse(put.body!).version).toBe(3)
    expect(handleRef.current?.dirty()).toBe(false)
  })

  it('a version conflict offers a reload that drops local edits', async () => {
    const { calls } = setup([json(409, { error: 'version_conflict', version: 9 })])
    fireEvent.click(await screen.findByRole('button', { name: /Thêm chữ/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chữ' }))
    expect((await screen.findAllByText(/vừa được sửa ở nơi khác/)).length).toBeGreaterThan(0)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tải lại' })) })
    await waitFor(() => expect(calls.filter(c => c.method === 'GET').length).toBe(2))
    expect(await screen.findByText(/Chưa có chữ nào/)).toBeTruthy()
  })

  it('the save handle saves a dirty draft before posting and reports a failure', async () => {
    const { handleRef } = setup([json(500, {})])
    fireEvent.click(await screen.findByRole('button', { name: /Thêm chữ/ }))
    let ok = true
    await act(async () => { ok = await handleRef.current!.save() })
    expect(ok).toBe(false)
  })

  it('shows a load failure', async () => {
    const fetchImpl = vi.fn(async () => json(500, {})) as unknown as typeof fetch
    render(<VideoOverlayPanel assetId="abc" previewUrl="blob:x" durationMs={5000} fetchImpl={fetchImpl} />)
    expect((await screen.findAllByText(/Không tải được chữ đã lưu/)).length).toBeGreaterThan(0)
  })
})

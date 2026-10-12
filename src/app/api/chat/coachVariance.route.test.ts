/**
 * Round 33, defect B at route level (TAPPY_AGENT=2): the SAME live case through POST /api/chat — scripted model, faked Serper (the coach rows), real tool, real answer composition and settle.
 * The text the user would read is asserted: the clause about variation by operator / vehicle type goes when the rows do not support it and stays when they do; price and source unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, rows: [] as Array<Record<string, string>> }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-agent-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: (opts: Record<string, any>) => {
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async (q: string) => (q.startsWith('ve xe khach') ? h.state.rows : []),
  webSearch: async () => ({ results: [] }),
}))

import { POST } from '@/app/api/chat/route'

const U = 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html'
const LIVE_ROWS = [
  { title: 'FUTA Bus Lines', link: 'https://futabus.vn/', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.' },
  { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: U, snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' },
  { title: 'công ty phương trang khai trương tuyến bến xe an sương', link: 'https://futabus.vn/tin-tuc/cong-ty-phuong-trang-khai-truong-tuyen-ben-xe-an-suong-ben-xe-quy-nhon', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP.' },
  { title: 'Xe Phương Trang | Đặt Vé Online, Giá Vé 2026 & Số điện ...', link: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', snippet: 'Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến, 350+ điểm bán. Xe giường nằm & Limousine VIP — chọn ghế, trả online ...' },
]
const TYPED_ROWS = [
  { title: 'Xe giường nằm Phương Trang', link: 'https://a.example/giuong-nam', snippet: 'Xe giường nằm Phương Trang TP.HCM đi Quy Nhơn giá 450.000đ một chiều.' },
  { title: 'Xe limousine Phương Trang', link: 'https://b.example/limousine', snippet: 'Xe limousine Phương Trang TP.HCM đi Quy Nhơn giá 650.000đ một chiều.' },
]
const MSG = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
const LIVE_TEXT = 'Vé xe khách TP.HCM–Quy Nhơn ngày **24/10/2026** đang được niêm yết **từ 410.000đ/chiều** trên Vexere; giá thực tế thay đổi theo nhà xe và loại xe. tra cứu ngày 12/10/2026.'

async function turn(rows: Array<Record<string, string>>, modelText: string) {
  h.state.rows = rows
  h.state.steps = [{ text: '', toolCalls: [{ toolCallId: 'c-1', toolName: 'get_transport_options', args: { origin: 'TP.HCM', destination: 'Quy Nhơn', mode: 'intercity', date: '2026-10-24' } }] }, { text: modelText, toolCalls: [] }]
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: MSG }] }), signal: undefined,
  }
  const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const body = await (await POST(req as never)).text()
  logs.mockRestore()
  const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  console.log('CASE ' + JSON.stringify({ name: 'route', model_input: modelText, final: text }))
  return text
}

beforeEach(() => { __resetAiQuestionQuotaLocal(); process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

describe('route level — the live coach case', () => {
  it('flag ON, live rows (types listed beside ONE fare): the clause about operator and vehicle type is gone; price, source and partner link are there', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const out = await turn(LIVE_ROWS, LIVE_TEXT)
    expect(out).not.toMatch(/thay đổi theo|nhà xe và loại xe|loại xe/)
    expect(out).toContain('Vé xe khách TP.HCM–Quy Nhơn ngày **24/10/2026** đang được niêm yết **từ 410.000đ/chiều** trên Vexere. tra cứu ngày 12/10/2026.')
    expect(out).toContain(`Giá theo kết quả tìm kiếm của: [vexere.com](${U})`)
    // (the partner link is added by the signed-link commerce step, which needs the affiliate secrets: absent in tests, present live — see the live trace)
    // reads as finished prose, line by line: no dangling punctuation, no doubled horizontal spaces (the blank line before the source line is legitimate)
    for (const line of out.split('\n')) {
      expect(line).not.toMatch(/[;,][ \t]*[.!?]/)
      expect(line).not.toMatch(/[ \t]{2,}/)
    }
  }, 40000)
  it('flag ON, two types with two different fares: "giá thay đổi theo loại xe" stays word for word', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const out = await turn(TYPED_ROWS, 'Vé xe khách TP.HCM–Quy Nhơn có hai mức: **450.000đ** (giường nằm) và **650.000đ** (limousine); giá thay đổi theo loại xe. Bạn xem thêm trên Vexere.')
    expect(out).toContain('Vé xe khách TP.HCM–Quy Nhơn có hai mức: **450.000đ** (giường nằm) và **650.000đ** (limousine); giá thay đổi theo loại xe. Bạn xem thêm trên Vexere.')
    expect(out).toContain('Giá theo kết quả tìm kiếm của: [a.example](https://a.example/giuong-nam) · [b.example](https://b.example/limousine)')
  }, 40000)
  it('CONTROL — flag OFF: the clause reaches the user', async () => {
    const out = await turn(LIVE_ROWS, LIVE_TEXT)
    expect(out).toContain('giá thực tế thay đổi theo nhà xe và loại xe')
  }, 40000)
})

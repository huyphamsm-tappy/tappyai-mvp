// @vitest-environment jsdom
//
// UAT3 P0 — the in-app deletion page: the published list is shown, the button stays disabled
// until the word is typed, success signs out and says what happens next, errors keep the account.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { vi as copyVi, en as copyEn } from '@/lib/i18n/accountDelete'

const signOut = vi.fn(async () => {})
vi.mock('@/lib/auth/signOut', () => ({ performSignOut: () => signOut() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/settings/delete-account',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/v3/V3Shell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import DeleteAccountView from './DeleteAccountView'

beforeEach(() => { setLocale('vi'); signOut.mockClear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const submit = () => screen.getByRole('button', { name: /Xóa vĩnh viễn tài khoản|Permanently delete account/ })

describe('DeleteAccountView', () => {
  it('shows every line of the published removal list, in both languages', () => {
    render(<DeleteAccountView user={null} />)
    for (let i = 1; i <= 9; i++) expect(screen.getByText(copyVi[`accountDelete.removes.${i}` as keyof typeof copyVi])).toBeTruthy()
    cleanup(); setLocale('en')
    render(<DeleteAccountView user={null} />)
    for (let i = 1; i <= 9; i++) expect(screen.getByText(copyEn[`accountDelete.removes.${i}` as keyof typeof copyEn])).toBeTruthy()
  })

  it('keeps the button disabled until the word is typed', () => {
    render(<DeleteAccountView user={null} />)
    const input = screen.getByLabelText(/Gõ XÓA để xác nhận/)
    expect((submit() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'xoa' } })
    expect((submit() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'xóa' } })
    expect((submit() as HTMLButtonElement).disabled).toBe(false)
  })

  it('on success: signs out and shows what happens next', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DeleteAccountView user={null} />)
    fireEvent.change(screen.getByLabelText(/Gõ XÓA để xác nhận|Type DELETE to confirm/), { target: { value: 'XÓA' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByText(copyVi['accountDelete.done.title'])).toBeTruthy())
    expect(screen.getByText(copyVi['accountDelete.done.p1'])).toBeTruthy()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/account/delete', expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirm: 'XÓA' }) }))
  })

  it('a staff refusal or a failure says the account is still there and does not sign out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 409 })))
    render(<DeleteAccountView user={null} />)
    fireEvent.change(screen.getByLabelText(/Gõ XÓA để xác nhận|Type DELETE to confirm/), { target: { value: 'XÓA' } })
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(copyVi['accountDelete.error.staff']))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    fireEvent.click(submit())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(copyVi['accountDelete.error.failed']))
    expect(signOut).not.toHaveBeenCalled()
  })
})


describe('owner 01/10: the warning is Huy’s text; the paid-plan paragraph shows only with an active plan', () => {
  it('no plan: the lead only', () => {
    const { container } = render(<DeleteAccountView user={null} />)
    expect(screen.getByText(/Xóa tài khoản vĩnh viễn\? Toàn bộ dữ liệu của bạn sẽ bị xóa ngay và không thể khôi phục: lịch sử chat, địa điểm đã lưu, bài đăng, ảnh và clip\./)).toBeTruthy()
    expect(container.querySelector('[data-delete-plan-note]')).toBeNull()
  })
  it('active plan: the plan paragraph appears (no refund, store subscription is not cancelled)', () => {
    const { container } = render(<DeleteAccountView user={null} hasPaidPlan />)
    const note = container.querySelector('[data-delete-plan-note]')!.textContent!
    expect(note).toContain('Tappy không hoàn lại phần chưa dùng')
    expect(note).toContain('không tự hủy gói trên App Store hoặc Google Play')
  })
  it('English', () => {
    setLocale('en')
    const { container } = render(<DeleteAccountView user={null} hasPaidPlan />)
    expect(container.textContent).toContain('Delete your account permanently?')
    expect(container.querySelector('[data-delete-plan-note]')!.textContent).toContain('does not refund the unused part')
  })
  it('a wrong word never enables the button (XOA1, xoa)', () => {
    render(<DeleteAccountView user={null} />)
    const input = screen.getByLabelText(/Gõ XÓA để xác nhận/)
    for (const w of ['XOA1', 'xoa', 'XÓAA', ' ']) { fireEvent.change(input, { target: { value: w } }); expect((submit() as HTMLButtonElement).disabled).toBe(true) }
  })
})

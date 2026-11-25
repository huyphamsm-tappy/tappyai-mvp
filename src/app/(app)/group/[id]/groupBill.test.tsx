// @vitest-environment jsdom
// The bill of a group meal on the screen (owner 20/11): enter it, see what you owe the payer, the payer marks who paid back, edits and deletes it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/lib/i18n/useTranslation', async () => {
  const { vi: dict } = await import('@/lib/i18n/presentation')
  const t = (k: string, vars?: Record<string, string>) => Object.entries(vars ?? {}).reduce((s, [n, v]) => s.split(`{${n}}`).join(v), dict[k] ?? k)
  return { useTranslation: () => ({ t, locale: 'vi' }) }
})

import GroupBill, { type BillShape } from './GroupBill'

const people = [{ key: 'leader', name: 'Huy' }, { key: 'm1', name: 'Linh' }, { key: 'm2', name: 'Cuong' }]
const calls: Array<{ url: string; init?: RequestInit }> = []
let ok = true
beforeEach(() => {
  calls.length = 0
  ok = true
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 400 }) }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const bill = (over: Partial<BillShape> = {}): BillShape => ({
  payerKey: 'm1', payerName: 'Linh', totalVnd: 300_000, tipVnd: 0, items: [], excluded: [], paid: {}, isPayer: true,
  settlement: {
    sharedVnd: 300_000,
    shares: [{ id: 'leader', name: 'Huy', personalVnd: 0, dueVnd: 100_000 }, { id: 'm1', name: 'Linh', personalVnd: 0, dueVnd: 100_000 }, { id: 'm2', name: 'Cuong', personalVnd: 0, dueVnd: 100_000 }],
    transfers: [{ fromId: 'leader', toId: 'm1', amountVnd: 100_000 }, { fromId: 'm2', toId: 'm1', amountVnd: 100_000 }],
  },
  ...over,
})

describe('entering the bill', () => {
  it('with no bill: a start button, a form, and the numbers go to the server with who is left out and the personal items', async () => {
    const onChanged = vi.fn()
    render(<GroupBill groupId="g-1" people={people} bill={null} onChanged={onChanged} />)
    fireEvent.click(screen.getByTestId('group-bill-start'))
    fireEvent.change(screen.getByTestId('group-bill-total'), { target: { value: '450.000' } })
    fireEvent.click(screen.getByLabelText('Cuong')) // not sharing
    fireEvent.click(screen.getByTestId('group-bill-add-item'))
    const row = screen.getByTestId('group-bill-item')
    fireEvent.change(row.querySelector('input[aria-label="Tên món"]')!, { target: { value: 'Bia' } })
    fireEvent.change(row.querySelector('input[aria-label="Số tiền (đồng)"]')!, { target: { value: '60000' } })
    fireEvent.change(row.querySelector('select')!, { target: { value: 'm1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hóa đơn' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].url).toBe('/api/group/g-1/bill')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ totalVnd: 450_000, tipVnd: 0, items: [{ name: 'Bia', amountVnd: 60_000, forId: 'm1' }], excluded: ['m2'] })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
  it('a refused bill shows the message and stays in the form', async () => {
    ok = false
    render(<GroupBill groupId="g-1" people={people} bill={null} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByTestId('group-bill-start'))
    fireEvent.change(screen.getByTestId('group-bill-total'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hóa đơn' }))
    expect((await screen.findByRole('alert')).textContent).toContain('chưa hợp lệ')
    expect(screen.getByTestId('group-bill-form')).toBeTruthy()
  })
})

describe('the bill as the payer sees it', () => {
  it('who paid, what each person owes the payer, and a button to mark each as paid', async () => {
    render(<GroupBill groupId="g-1" people={people} bill={bill()} onChanged={vi.fn()} />)
    const view = screen.getByTestId('group-bill-view')
    expect(view.textContent).toContain('Linh đã trả 300.000đ cho cả bàn')
    const shares = screen.getAllByTestId('group-bill-share').map(e => e.textContent)
    expect(shares[0]).toContain('Huy trả Linh')
    expect(shares[0]).toContain('100.000đ')
    fireEvent.click(screen.getAllByTestId('group-bill-mark')[1])
    await waitFor(() => expect(JSON.parse(String(calls[0].init?.body))).toEqual({ memberKey: 'm2', paid: true }))
    expect(calls[0].init?.method).toBe('PATCH')
  })
  it('the payer can edit (the form is filled with the bill) and delete after a confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GroupBill groupId="g-1" people={people} bill={bill({ tipVnd: 20_000, items: [{ name: 'Bia', amountVnd: 30_000, forId: 'm2' }], excluded: ['leader'] })} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByTestId('group-bill-edit'))
    expect((screen.getByTestId('group-bill-total') as HTMLInputElement).value).toBe('300000')
    expect((screen.getByLabelText('Huy') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xóa hóa đơn' }))
    await waitFor(() => expect(calls.some(c => c.init?.method === 'DELETE')).toBe(true))
    confirm.mockRestore()
  })
})

describe('the bill as another person sees it', () => {
  it('no mark buttons and no edit; a person who paid back is shown as paid', () => {
    render(<GroupBill groupId="g-1" people={people} bill={bill({ isPayer: false, paid: { m2: true } })} onChanged={vi.fn()} />)
    expect(screen.queryByTestId('group-bill-mark')).toBeNull()
    expect(screen.queryByTestId('group-bill-edit')).toBeNull()
    expect(screen.getByTestId('group-bill-view').textContent).toContain('Đã trả ✓')
  })
  it('a person who owes nothing is told so; a bill with no settlement asks to be entered again', () => {
    const b = bill({ isPayer: false })
    b.settlement!.shares[2].dueVnd = 0
    const a = render(<GroupBill groupId="g-1" people={people} bill={b} onChanged={vi.fn()} />)
    expect(screen.getAllByTestId('group-bill-share')[2].textContent).toContain('Cuong: không phải trả')
    a.unmount()
    render(<GroupBill groupId="g-1" people={people} bill={bill({ settlement: null })} onChanged={vi.fn()} />)
    expect(screen.getByTestId('group-bill-view').textContent).toContain('nhập lại')
  })
})

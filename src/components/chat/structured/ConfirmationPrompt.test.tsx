// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ConfirmationPrompt from './ConfirmationPrompt'

// This project does not enable vitest `globals`, so RTL's auto-cleanup never registers.
// Without this, every render stacks in the same document and getByTestId finds duplicates.
afterEach(cleanup)

// P4-03 — ConfirmationPrompt (DD-006). This component is the visible action boundary, so the tests
// that matter are the ones about what CANNOT happen: no confirm without an explicit press, no
// double-submit, no silent retry, no silent failure.

describe('ConfirmationPrompt — the action boundary', () => {
  it('states the consequence and what changes', () => {
    render(
      <ConfirmationPrompt
        consequence="Tappy sẽ gửi yêu cầu đặt bàn tới Nhà hàng A."
        changes={['2 người · Tối nay 19:30', 'Liên hệ: 09xx xxx xxx']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/gửi yêu cầu đặt bàn/)).toBeTruthy()
    expect(screen.getByTestId('confirmation-changes').textContent).toContain('Tối nay 19:30')
  })

  it('does nothing until the user presses confirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmationPrompt consequence="X" onConfirm={onConfirm} onCancel={vi.fn()} />)
    expect(onConfirm, 'rendering a prompt must never perform the action').not.toHaveBeenCalled()
  })

  it('puts initial focus on cancel, not confirm', () => {
    render(<ConfirmationPrompt consequence="X" destructive onConfirm={vi.fn()} onCancel={vi.fn()} />)
    // A reflexive Enter must select the safe choice.
    expect(document.activeElement).toBe(screen.getByTestId('confirmation-cancel'))
  })

  it('Escape cancels — it never confirms', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmationPrompt consequence="X" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm, 'abandonment must fail closed').not.toHaveBeenCalled()
  })

  it('disables both controls while the action is in flight (no double-submit)', async () => {
    let resolve: () => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>(r => { resolve = r }))
    render(<ConfirmationPrompt consequence="X" onConfirm={onConfirm} onCancel={vi.fn()} />)

    const confirm = screen.getByTestId('confirmation-confirm')
    fireEvent.click(confirm)

    await waitFor(() => expect(confirm.getAttribute('aria-busy')).toBe('true'))
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('confirmation-cancel') as HTMLButtonElement).disabled).toBe(true)

    // A second press while in flight must not start a second action.
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()

    resolve()
    await waitFor(() => expect(screen.getByTestId('confirmation-success')).toBeTruthy())
  })

  it('reports the result plainly on success', async () => {
    render(
      <ConfirmationPrompt
        consequence="X"
        successMessage="Đã gửi yêu cầu đặt bàn."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('confirmation-confirm'))
    await waitFor(() => {
      expect(screen.getByTestId('confirmation-success').textContent).toContain('Đã gửi yêu cầu đặt bàn.')
    })
  })

  it('shows the failure, keeps the prompt open, and does not retry by itself', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Nhà hàng không nhận đặt bàn lúc này.'))
    render(<ConfirmationPrompt consequence="X" onConfirm={onConfirm} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByTestId('confirmation-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('confirmation-error').textContent).toContain('không nhận đặt bàn')
    })
    // Still open, still the user's decision.
    expect(screen.getByTestId('confirmation-confirm')).toBeTruthy()
    expect(onConfirm, 'a failed action is never retried on the user behalf').toHaveBeenCalledOnce()
  })

  it('is announced to assistive technology as a dialog labelled by its consequence', () => {
    render(<ConfirmationPrompt consequence="Tappy sẽ gửi yêu cầu." onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Tappy sẽ gửi yêu cầu.')
  })

  it('meets the 44px touch-target minimum on both controls', () => {
    render(<ConfirmationPrompt consequence="X" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    for (const id of ['confirmation-confirm', 'confirmation-cancel']) {
      expect(screen.getByTestId(id).className).toContain('min-h-[44px]')
    }
  })
})

// @vitest-environment jsdom
// CONSULT_V3 choice card: picking options and pressing "Chốt" sends ONE plain user message with the picks in order; nothing is sent
// before a pick, and a second press sends nothing.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ChoiceCard from './ChoiceCard'

afterEach(() => cleanup())
const GROUPS = [{ q: 'Hai bạn xuất phát từ đâu?', options: ['TP.HCM', 'Hà Nội'] }, { q: 'Muốn ở kiểu nào?', options: ['Resort sát biển', 'Khách sạn trung tâm'] }]

describe('ChoiceCard', () => {
  it('the button is disabled until a pick; the picks are sent once, in group order', () => {
    const onSend = vi.fn()
    render(<ChoiceCard groups={GROUPS} onSend={onSend} />)
    const button = screen.getByRole('button')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Resort sát biển'))
    fireEvent.click(screen.getByLabelText('TP.HCM'))
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('TP.HCM · Resort sát biển')
  })
  it('UAT 17/10: an "other" option opens a text box; the answer carries what was typed; nothing is sent while it is empty', () => {
    const onSend = vi.fn()
    render(<ChoiceCard groups={[{ q: 'Tui nên chỉnh kế hoạch theo nơi xuất phát nào?', options: ['Hà Nội', 'Hải Phòng', 'Nơi khác'] }]} onSend={onSend} />)
    expect(screen.queryByPlaceholderText('Gõ lựa chọn của bạn…')).toBeNull()
    fireEvent.click(screen.getByLabelText('Nơi khác'))
    const box = screen.getByPlaceholderText('Gõ lựa chọn của bạn…')
    const button = screen.getByRole('button')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    fireEvent.keyDown(box, { key: 'Enter' }) // Enter in the empty box sends nothing either
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: 'Cần Thơ' } })
    fireEvent.click(button)
    expect(onSend).toHaveBeenCalledWith('Nơi khác: Cần Thơ')
  })
  it('shows every question and option', () => {
    render(<ChoiceCard groups={GROUPS} onSend={() => {}} />)
    for (const s of ['Hai bạn xuất phát từ đâu?', 'Muốn ở kiểu nào?', 'Hà Nội', 'Khách sạn trung tâm']) expect(screen.getByText(s)).toBeTruthy()
  })
})

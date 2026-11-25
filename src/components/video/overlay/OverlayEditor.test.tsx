// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { OverlayEditor } from './OverlayEditor'
import { MAX_LAYERS, defaultTextLayer, emptyOverlay, validateOverlayDoc, type OverlayDoc } from '@/lib/media/video/overlay/schema'

afterEach(cleanup)
const D = 6000

function Harness({ initial = emptyOverlay(), time = 0, onDoc, disabled }: { initial?: OverlayDoc; time?: number; onDoc?: (d: OverlayDoc) => void; disabled?: boolean }) {
  const [doc, setDoc] = useState(initial)
  return <OverlayEditor doc={doc} onChange={d => { setDoc(d); onDoc?.(d) }} durationMs={D} currentTimeMs={time} media={<div data-testid="media" />} aspectRatio={9 / 16} frameWidth={360} disabled={disabled} />
}
const withLayers = (...texts: string[]): OverlayDoc => ({ schema_version: 1, layers: texts.map((t, i) => ({ ...defaultTextLayer(`l${i}`, D), text: t })) })
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0] as OverlayDoc

describe('adding, editing, removing, reordering', () => {
  it('"Thêm chữ" adds a layer that starts at the playing position, selects it and shows its controls', async () => {
    const onDoc = vi.fn()
    render(<Harness time={1500} onDoc={onDoc} />)
    expect(screen.getByText(/Chưa có chữ nào/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Thêm chữ/ }))
    const doc = last(onDoc)
    expect(doc.layers).toHaveLength(1)
    expect(doc.layers[0]).toMatchObject({ start_ms: 1500, end_ms: 4500 })
    expect(validateOverlayDoc(doc, { durationMs: D }).ok).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Nội dung' })).toBeTruthy()
    expect(document.querySelector(`[data-layer-id="${doc.layers[0].id}"]`)).not.toBeNull()
  })

  it('typing in the text box edits the layer and the preview shows it at once (Vietnamese with diacritics)', async () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('a')} onDoc={onDoc} />)
    const box = screen.getByRole('textbox', { name: 'Nội dung' })
    fireEvent.change(box, { target: { value: 'Xin chào Đà Nẵng!' } })
    expect(last(onDoc).layers[0].text).toBe('Xin chào Đà Nẵng!')
    expect(document.querySelector('[data-layer-text]')?.textContent).toBe('Xin chào Đà Nẵng!')
  })

  it('removes a layer and moves the selection to what is left', async () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('một', 'hai')} onDoc={onDoc} />)
    await userEvent.click(screen.getByRole('button', { name: /Xóa lớp này: một/ }))
    expect(last(onDoc).layers.map(l => l.text)).toEqual(['hai'])
    expect((screen.getByRole('textbox', { name: 'Nội dung' }) as HTMLTextAreaElement).value).toBe('hai')
  })

  it('reorders with up / down, and the end buttons are disabled', async () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('một', 'hai')} onDoc={onDoc} />)
    expect((screen.getByRole('button', { name: /Đưa lên trên: một/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Đưa xuống dưới: hai/ }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /Đưa xuống dưới: một/ }))
    expect(last(onDoc).layers.map(l => l.text)).toEqual(['hai', 'một'])
  })

  it('stops adding at the layer limit and says why', () => {
    const many = withLayers(...Array.from({ length: MAX_LAYERS }, (_, i) => `t${i}`))
    render(<Harness initial={many} />)
    expect((screen.getByRole('button', { name: /Thêm chữ/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/Tối đa 10/)
  })
})

describe('style controls', () => {
  it('alignment, bold, colour, background, outline and shadow all reach the document and stay valid', async () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    await userEvent.click(screen.getByRole('button', { name: 'Căn phải' }))
    expect(last(onDoc).layers[0].align).toBe('right')
    const bold = screen.getByRole('checkbox', { name: 'In đậm' }) as HTMLInputElement
    await userEvent.click(bold)
    expect(last(onDoc).layers[0].weight).toBe('normal')
    fireEvent.change(screen.getByLabelText('Màu chữ'), { target: { value: '#ff8800' } })
    expect(last(onDoc).layers[0].color).toBe('#ff8800')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Nền chữ' }))
    expect(last(onDoc).layers[0].background).toEqual({ color: '#000000', opacity: 0.6 })
    fireEvent.change(screen.getByRole('slider', { name: 'Độ đặc của nền' }), { target: { value: '0.9' } })
    expect(last(onDoc).layers[0].background?.opacity).toBe(0.9)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nền chữ' }))
    expect(last(onDoc).layers[0].background).toBeNull()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Viền chữ' })) // default has an outline: this turns it off
    expect(last(onDoc).layers[0].outline).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Đổ bóng' }))
    expect(last(onDoc).layers[0].shadow).toBe(false)

    fireEvent.change(screen.getByRole('slider', { name: 'Cỡ chữ' }), { target: { value: '0.15' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Góc xoay' }), { target: { value: '45' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Độ rộng khung' }), { target: { value: '0.5' } })
    const l = last(onDoc).layers[0]
    expect([l.size, l.rotation, l.width]).toEqual([0.15, 45, 0.5])
    expect(validateOverlayDoc(last(onDoc), { durationMs: D }).ok).toBe(true)
  })

  it('the font list offers only the allowed fonts', () => {
    render(<Harness initial={withLayers('x')} />)
    const select = screen.getByRole('combobox', { name: 'Phông chữ' })
    expect(within(select).getAllByRole('option').map(o => (o as HTMLOptionElement).value)).toEqual(['sans'])
  })

  it('the text box is capped at the schema limit', () => {
    render(<Harness initial={withLayers('x')} />)
    expect((screen.getByRole('textbox', { name: 'Nội dung' }) as HTMLTextAreaElement).maxLength).toBe(200)
  })
})

describe('keyboard on the preview', () => {
  it('arrows nudge the focused layer (Shift = bigger step) and stay in the frame; Delete removes it', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    const box = document.querySelector('[data-layer-id="l0"]') as HTMLElement
    fireEvent.keyDown(box, { key: 'ArrowRight' })
    expect(last(onDoc).layers[0].x).toBeCloseTo(0.51, 5)
    fireEvent.keyDown(box, { key: 'ArrowUp', shiftKey: true })
    expect(last(onDoc).layers[0].y).toBeCloseTo(0.45, 5)
    for (let i = 0; i < 30; i++) fireEvent.keyDown(box, { key: 'ArrowLeft', shiftKey: true })
    expect(last(onDoc).layers[0].x).toBe(0)
    fireEvent.keyDown(box, { key: 'Delete' })
    expect(last(onDoc).layers).toHaveLength(0)
  })

  it('double click (or Enter) edits the text right on the preview, and Escape leaves', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    const box = document.querySelector('[data-layer-id="l0"]') as HTMLElement
    fireEvent.doubleClick(box)
    const inline = box.querySelector('textarea') as HTMLTextAreaElement
    expect(inline).not.toBeNull()
    fireEvent.change(inline, { target: { value: 'sửa tại chỗ' } })
    expect(last(onDoc).layers[0].text).toBe('sửa tại chỗ')
    fireEvent.keyDown(inline, { key: 'Escape' })
    expect(box.querySelector('textarea')).toBeNull()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.querySelector('textarea')).not.toBeNull()
  })

  it('arrow keys typed while editing text do not move the layer', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    const box = document.querySelector('[data-layer-id="l0"]') as HTMLElement
    fireEvent.doubleClick(box)
    const calls = onDoc.mock.calls.length
    fireEvent.keyDown(box.querySelector('textarea') as HTMLElement, { key: 'ArrowRight' })
    expect(onDoc.mock.calls.length).toBe(calls)
  })
})

describe('pointer: drag, scale, rotate', () => {
  function frame() {
    const el = screen.getByTestId('overlay-frame')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 640, right: 360, bottom: 640, x: 0, y: 0, toJSON() {} }) as DOMRect
    return el
  }
  const down = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1 })
  const move = (el: Element, x: number, y: number) => fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1 })

  it('dragging the body moves the layer by the pointer travel as a fraction of the frame', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    const f = frame()
    const box = document.querySelector('[data-layer-id="l0"]') as HTMLElement
    down(box, 180, 320)
    move(f, 216, 384) // +36 px, +64 px
    const l = last(onDoc).layers[0]
    expect(l.x).toBeCloseTo(0.6, 5)
    expect(l.y).toBeCloseTo(0.6, 5)
    fireEvent.pointerUp(f)
    const calls = onDoc.mock.calls.length
    move(f, 300, 500)
    expect(onDoc.mock.calls.length).toBe(calls) // released: no more movement
  })

  it('the corner handle scales the text and the top handle rotates it', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} />)
    const f = frame()
    down(screen.getByRole('button', { name: 'Kéo để đổi cỡ chữ' }), 280, 320) // 100 px right of the centre
    move(f, 380, 320) // 200 px away: twice as far
    expect(last(onDoc).layers[0].size).toBeCloseTo(0.14, 5)
    fireEvent.pointerUp(f)
    down(screen.getByRole('button', { name: 'Kéo để xoay chữ' }), 180, 200)
    move(f, 330, 320) // to the right of the centre: 90 degrees
    expect(last(onDoc).layers[0].rotation).toBe(90)
    expect(validateOverlayDoc(last(onDoc), { durationMs: D }).ok).toBe(true)
  })

  it('nothing can be dragged while disabled, and there are no handles', () => {
    const onDoc = vi.fn()
    render(<Harness initial={withLayers('x')} onDoc={onDoc} disabled />)
    const f = frame()
    down(document.querySelector('[data-layer-id="l0"]') as HTMLElement, 180, 320)
    move(f, 250, 400)
    expect(onDoc).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Kéo để đổi cỡ chữ' })).toBeNull()
    expect((screen.getByRole('button', { name: /Thêm chữ/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('timeline', () => {
  it('the handles are sliders with the times in seconds; arrows move by 0.1 s, Shift by 1 s, never crossing', () => {
    const onDoc = vi.fn()
    render(<Harness initial={{ schema_version: 1, layers: [{ ...defaultTextLayer('l0', D), text: 'x', start_ms: 1000, end_ms: 3000 }] }} onDoc={onDoc} />)
    const end = screen.getByRole('slider', { name: 'Điểm kết thúc hiển thị' })
    expect(end.getAttribute('aria-valuenow')).toBe('3000')
    expect(end.getAttribute('aria-valuetext')).toBe('3.0 s')
    fireEvent.keyDown(end, { key: 'ArrowRight' })
    expect(last(onDoc).layers[0].end_ms).toBe(3100)
    fireEvent.keyDown(end, { key: 'ArrowRight', shiftKey: true })
    expect(last(onDoc).layers[0].end_ms).toBe(4100)
    fireEvent.keyDown(end, { key: 'End' })
    expect(last(onDoc).layers[0].end_ms).toBe(D)

    const start = screen.getByRole('slider', { name: 'Điểm bắt đầu hiển thị' })
    fireEvent.keyDown(start, { key: 'ArrowLeft', shiftKey: true })
    expect(last(onDoc).layers[0].start_ms).toBe(0)
    fireEvent.keyDown(start, { key: 'End' })
    const l = last(onDoc).layers[0]
    expect(l.end_ms - l.start_ms).toBeGreaterThanOrEqual(200)
    expect(validateOverlayDoc(last(onDoc), { durationMs: D }).ok).toBe(true)
  })

  it('shows the layer on the preview only inside its window (the selected one is always shown so it can be edited)', () => {
    const doc: OverlayDoc = { schema_version: 1, layers: [
      { ...defaultTextLayer('a', D), text: 'A', start_ms: 0, end_ms: 1000 },
      { ...defaultTextLayer('b', D), text: 'B', start_ms: 2000, end_ms: 3000 },
    ] }
    const { rerender } = render(<OverlayEditor doc={doc} onChange={() => {}} durationMs={D} currentTimeMs={500} media={null} aspectRatio={0.5625} frameWidth={360} />)
    const inFrame = () => [...screen.getByTestId('overlay-frame').querySelectorAll('[data-layer-id]')].map(n => n.getAttribute('data-layer-id'))
    // 'a' is selected (first), 'b' is outside its window and not selected
    expect(inFrame()).toEqual(['a'])
    rerender(<OverlayEditor doc={doc} onChange={() => {}} durationMs={D} currentTimeMs={2500} media={null} aspectRatio={0.5625} frameWidth={360} />)
    expect(inFrame()).toEqual(['a', 'b']) // 'a' stays because it is selected
  })

  it('selecting a row in the timeline selects the layer', async () => {
    render(<Harness initial={withLayers('một', 'hai')} />)
    await userEvent.click(within(screen.getByRole('group', { name: 'Thời gian hiển thị' })).getByRole('button', { name: 'hai' }))
    expect((screen.getByRole('textbox', { name: 'Nội dung' }) as HTMLTextAreaElement).value).toBe('hai')
  })
})

'use client'
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCw, Trash2 } from 'lucide-react'
import { MAX_LAYERS, type OverlayDoc, type OverlayLayer } from '@/lib/media/video/overlay/schema'
import { isLayerVisible } from '@/lib/media/video/overlay/layout'
import { addLayer, moveLayer, movedPosition, nudgeLayer, removeLayer, rotationAt, scaledSize, updateLayer, type Point } from './editorOps'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { overlayLabels, type OverlayLabels } from './labels'
import { TextLayerView } from './TextLayerView'
import { Timeline } from './Timeline'
import { LayerControls } from './LayerControls'
import { layerTextStyle } from './layerStyle'
import { useElementWidth } from './hooks'

export interface OverlayEditorProps {
  doc: OverlayDoc
  onChange(doc: OverlayDoc): void
  /** The clip's own length in milliseconds (from the file's header). */
  durationMs: number
  /** The playing position, so a new layer starts where the author is and the timeline shows a cursor. */
  currentTimeMs: number
  onSeek?(ms: number): void
  /** The <video> (or a poster image) the layers are drawn over. It fills the preview frame. */
  media: ReactNode
  /** The picture's width / height (e.g. 9 / 16 for a portrait clip). */
  aspectRatio: number
  labels?: Partial<OverlayLabels>
  disabled?: boolean
  /** Override the measured preview width (tests). */
  frameWidth?: number
}

type Drag = { kind: 'move' | 'scale' | 'rotate'; id: string; from: Point; layer: OverlayLayer }

/**
 * The text overlay editor (Explore video VID-02): a live preview over the video where layers are dragged, scaled and rotated, a list to add / remove / reorder them, style
 * controls, and a timeline with start and end handles. It is CONTROLLED: it never stores anything, it hands the new document to `onChange` (see useOverlayDraft for saving).
 * Every edit goes through editorOps, which keeps each field inside the schema's range, so the document it produces is always one the server accepts.
 */
export function OverlayEditor({ doc, onChange, durationMs, currentTimeMs, onSeek, media, aspectRatio, labels: custom, disabled, frameWidth: widthOverride }: OverlayEditorProps) {
  const { t } = useTranslation()
  const labels = { ...overlayLabels(t), ...custom }
  const frameRef = useRef<HTMLDivElement>(null)
  const frameWidth = useElementWidth(frameRef, widthOverride)
  const [selectedId, setSelectedId] = useState<string | null>(doc.layers[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)

  const selected = doc.layers.find(l => l.id === selectedId) ?? null
  const patch = (id: string, p: Partial<OverlayLayer>) => onChange(updateLayer(doc, id, p, durationMs))
  const rect = () => {
    const r = frameRef.current?.getBoundingClientRect()
    return { left: r?.left ?? 0, top: r?.top ?? 0, width: r?.width || frameWidth, height: r?.height || frameWidth / aspectRatio }
  }

  const onAdd = () => {
    const r = addLayer(doc, durationMs, currentTimeMs)
    if (!r.id) return
    onChange(r.doc)
    setSelectedId(r.id)
  }
  const onRemove = (id: string) => {
    const next = removeLayer(doc, id)
    onChange(next)
    if (selectedId === id) setSelectedId(next.layers[0]?.id ?? null)
    if (editingId === id) setEditingId(null)
  }

  const startDrag = (e: ReactPointerEvent, layer: OverlayLayer, kind: Drag['kind']) => {
    if (disabled) return
    e.stopPropagation()
    setSelectedId(layer.id)
    drag.current = { kind, id: layer.id, from: { x: e.clientX, y: e.clientY }, layer }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onFrameMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const to = { x: e.clientX, y: e.clientY }
    const r = rect()
    if (d.kind === 'move') patch(d.id, movedPosition(d.layer, d.from, to, r))
    else if (d.kind === 'scale') patch(d.id, { size: scaledSize(d.layer, d.from, to, r) })
    else patch(d.id, { rotation: rotationAt(d.layer, to, r) })
  }
  const endDrag = () => { drag.current = null }

  const onLayerKey = (e: KeyboardEvent, layer: OverlayLayer) => {
    if (disabled || editingId === layer.id) return
    const step = e.shiftKey ? 0.05 : 0.01
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[e.key]) { e.preventDefault(); onChange(nudgeLayer(doc, layer.id, moves[e.key][0], moves[e.key][1], durationMs)) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onRemove(layer.id) }
    else if (e.key === 'Enter') { e.preventDefault(); setEditingId(layer.id) }
  }

  const handleStyle: React.CSSProperties = { position: 'absolute', width: 22, height: 22, borderRadius: 11, border: '2px solid #fff', background: 'var(--ov-accent, #2563eb)', padding: 0, touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }
  const shown = doc.layers.filter(l => l.id === selectedId || isLayerVisible(l, currentTimeMs))

  return (
    <section aria-label={labels.editorTitle} style={{ display: 'grid', gap: 16 }}>
      <div
        ref={frameRef}
        data-testid="overlay-frame"
        onPointerMove={onFrameMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={() => { if (!drag.current) { setSelectedId(null); setEditingId(null) } }}
        style={{ position: 'relative', width: '100%', aspectRatio: String(aspectRatio), overflow: 'hidden', background: '#000', borderRadius: 12, userSelect: 'none' }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>{media}</div>
        {frameWidth > 0 && shown.map(layer => {
          const isSelected = layer.id === selectedId
          const editing = editingId === layer.id
          return (
            <TextLayerView
              key={layer.id}
              layer={layer}
              frameWidth={frameWidth}
              role="group"
              aria-label={`${labels.layerFallbackName}: ${layer.text.slice(0, 40)}`}
              tabIndex={0}
              onPointerDown={e => startDrag(e, layer, 'move')}
              onDoubleClick={() => { if (!disabled) setEditingId(layer.id) }}
              onKeyDown={e => onLayerKey(e, layer)}
              onFocus={() => setSelectedId(layer.id)}
            >
              {isSelected && (
                <>
                  <div aria-hidden style={{ position: 'absolute', inset: -2, border: '1.5px dashed #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.6)', pointerEvents: 'none' }} />
                  {editing && (
                    <textarea
                      autoFocus
                      aria-label={labels.text}
                      value={layer.text}
                      onChange={e => patch(layer.id, { text: e.target.value })}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setEditingId(null) }}
                      onPointerDown={e => e.stopPropagation()}
                      style={{ ...layerTextStyle(layer, frameWidth), position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 0, background: 'rgba(0,0,0,.55)', overflow: 'hidden', userSelect: 'text', WebkitTextStroke: undefined, textShadow: 'none' }}
                    />
                  )}
                  {!disabled && !editing && (
                    <>
                      <button type="button" aria-label={labels.rotateHandle} onPointerDown={e => startDrag(e, layer, 'rotate')} style={{ ...handleStyle, left: '50%', top: -34, marginLeft: -11, cursor: 'grab' }}><RotateCw size={12} aria-hidden /></button>
                      <button type="button" aria-label={labels.scaleHandle} onPointerDown={e => startDrag(e, layer, 'scale')} style={{ ...handleStyle, right: -11, bottom: -11, cursor: 'nwse-resize' }} />
                    </>
                  )}
                </>
              )}
            </TextLayerView>
          )
        })}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>{labels.layers}</h3>
          <button type="button" onClick={onAdd} disabled={disabled || doc.layers.length >= MAX_LAYERS}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 0, background: 'var(--ov-accent, #2563eb)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
            <Plus size={14} aria-hidden /> {labels.addText}
          </button>
        </div>
        {doc.layers.length >= MAX_LAYERS && <p role="status" style={{ margin: 0, fontSize: 12 }}>{labels.tooManyLayers}</p>}
        {doc.layers.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{labels.noLayers}</p>
        ) : (
          <ul aria-label={labels.layers} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {doc.layers.map((l, i) => (
              <li key={l.id} data-layer-row={l.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => setSelectedId(l.id)} aria-current={l.id === selectedId ? 'true' : undefined}
                  style={{ flex: 1, textAlign: 'left', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(127,127,127,.4)', background: l.id === selectedId ? 'rgba(37,99,235,.15)' : 'transparent', color: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {l.text.split('\n')[0] || `${labels.layerFallbackName} ${i + 1}`}
                </button>
                <button type="button" aria-label={`${labels.moveUp}: ${l.text.slice(0, 20)}`} disabled={disabled || i === 0} onClick={() => onChange(moveLayer(doc, l.id, -1))}><ArrowUp size={14} aria-hidden /></button>
                <button type="button" aria-label={`${labels.moveDown}: ${l.text.slice(0, 20)}`} disabled={disabled || i === doc.layers.length - 1} onClick={() => onChange(moveLayer(doc, l.id, 1))}><ArrowDown size={14} aria-hidden /></button>
                <button type="button" aria-label={`${labels.remove}: ${l.text.slice(0, 20)}`} disabled={disabled} onClick={() => onRemove(l.id)}><Trash2 size={14} aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && <LayerControls layer={selected} labels={labels} disabled={disabled} onPatch={p => patch(selected.id, p)} />}

      {doc.layers.length > 0 && (
        <Timeline
          layers={doc.layers}
          selectedId={selectedId}
          durationMs={durationMs}
          currentTimeMs={currentTimeMs}
          labels={labels}
          onSelect={setSelectedId}
          onTimes={(id, start, end) => patch(id, { start_ms: start, end_ms: end })}
          onSeek={onSeek}
        />
      )}
    </section>
  )
}

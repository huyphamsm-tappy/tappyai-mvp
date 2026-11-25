'use client'
import { useRef } from 'react'
import type { OverlayLayer } from '@/lib/media/video/overlay/schema'
import { MIN_LAYER_MS, formatSeconds } from './editorOps'
import type { OverlayLabels } from './labels'

interface TimelineProps {
  layers: OverlayLayer[]
  selectedId: string | null
  durationMs: number
  currentTimeMs: number
  labels: OverlayLabels
  onSelect(id: string): void
  /** The selected layer's new window (already in whole milliseconds, inside the clip). */
  onTimes(id: string, start: number, end: number): void
  onSeek?(ms: number): void
}

const STEP = 100
const BIG_STEP = 1000

/** One row per layer: a bar from its start to its end over the clip's length. The selected row has two handles (drag, or arrow keys; Shift = one second). */
export function Timeline({ layers, selectedId, durationMs, currentTimeMs, labels, onSelect, onTimes, onSeek }: TimelineProps) {
  const track = useRef<HTMLDivElement | null>(null)
  const pct = (ms: number) => `${(Math.min(Math.max(ms, 0), durationMs) / durationMs) * 100}%`

  const msAt = (clientX: number): number => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    return Math.round(((clientX - r.left) / r.width) * durationMs)
  }

  const moveHandle = (layer: OverlayLayer, which: 'start' | 'end', ms: number) => {
    if (which === 'start') onTimes(layer.id, Math.min(Math.max(0, ms), layer.end_ms - MIN_LAYER_MS), layer.end_ms)
    else onTimes(layer.id, layer.start_ms, Math.max(Math.min(durationMs, ms), layer.start_ms + MIN_LAYER_MS))
  }

  return (
    <div role="group" aria-label={labels.timeline} style={{ display: 'grid', gap: 6 }}>
      {layers.map((layer, i) => {
        const selected = layer.id === selectedId
        const name = layer.text.split('\n')[0].slice(0, 24) || `${labels.layerFallbackName} ${i + 1}`
        return (
          <div key={layer.id} data-timeline-row={layer.id} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => onSelect(layer.id)} aria-pressed={selected} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: selected ? 700 : 400, background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
              {name}
            </button>
            <div
              ref={selected ? track : undefined}
              data-track
              onClick={e => { if (e.target === e.currentTarget) { onSelect(layer.id); onSeek?.(msAt(e.clientX)) } }}
              style={{ position: 'relative', height: 24, borderRadius: 6, background: 'var(--ov-track, rgba(127,127,127,.25))', touchAction: 'none' }}
            >
              <div data-bar style={{ position: 'absolute', top: 3, bottom: 3, left: pct(layer.start_ms), width: `calc(${pct(layer.end_ms)} - ${pct(layer.start_ms)})`, borderRadius: 4, background: selected ? 'var(--ov-accent, #2563eb)' : 'rgba(37,99,235,.45)', pointerEvents: 'none' }} />
              <div data-cursor aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: pct(currentTimeMs), width: 2, background: 'var(--ov-cursor, #ef4444)', pointerEvents: 'none' }} />
              {selected && (['start', 'end'] as const).map(which => {
                const value = which === 'start' ? layer.start_ms : layer.end_ms
                return (
                  <button
                    key={which}
                    type="button"
                    role="slider"
                    aria-label={which === 'start' ? labels.startHandle : labels.endHandle}
                    aria-valuemin={which === 'start' ? 0 : layer.start_ms + MIN_LAYER_MS}
                    aria-valuemax={which === 'start' ? layer.end_ms - MIN_LAYER_MS : durationMs}
                    aria-valuenow={value}
                    aria-valuetext={formatSeconds(value)}
                    onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); e.preventDefault() }}
                    onPointerMove={e => { if (e.buttons === 1) moveHandle(layer, which, msAt(e.clientX)) }}
                    onKeyDown={e => {
                      const step = e.shiftKey ? BIG_STEP : STEP
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); moveHandle(layer, which, value - step) }
                      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); moveHandle(layer, which, value + step) }
                      else if (e.key === 'Home') { e.preventDefault(); moveHandle(layer, which, which === 'start' ? 0 : layer.start_ms + MIN_LAYER_MS) }
                      else if (e.key === 'End') { e.preventDefault(); moveHandle(layer, which, which === 'start' ? layer.end_ms - MIN_LAYER_MS : durationMs) }
                    }}
                    style={{ position: 'absolute', top: -2, width: 14, height: 28, marginLeft: -7, left: pct(value), borderRadius: 4, border: '2px solid #fff', background: 'var(--ov-accent, #2563eb)', cursor: 'ew-resize', padding: 0, touchAction: 'none' }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

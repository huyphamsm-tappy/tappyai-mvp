'use client'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { MAX_TEXT_LENGTH, OVERLAY_FONTS, type OverlayLayer } from '@/lib/media/video/overlay/schema'
import type { OverlayLabels } from './labels'

interface Props {
  layer: OverlayLayer
  labels: OverlayLabels
  disabled?: boolean
  onPatch(patch: Partial<OverlayLayer>): void
}

const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center', fontSize: 13 }

function Range({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; disabled?: boolean }) {
  return (
    <label style={row}>
      <span>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}

/** The style controls of the selected layer. Every control writes through `onPatch`; the editor clamps whatever it receives. */
export function LayerControls({ layer, labels, disabled, onPatch }: Props) {
  const aligns = [
    { value: 'left', label: labels.alignLeft, Icon: AlignLeft },
    { value: 'center', label: labels.alignCenter, Icon: AlignCenter },
    { value: 'right', label: labels.alignRight, Icon: AlignRight },
  ] as const
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        <span>{labels.text}</span>
        <textarea
          aria-label={labels.text}
          value={layer.text}
          maxLength={MAX_TEXT_LENGTH}
          rows={3}
          disabled={disabled}
          onChange={e => onPatch({ text: e.target.value })}
          style={{ width: '100%', font: 'inherit', padding: 8, borderRadius: 8, border: '1px solid rgba(127,127,127,.5)', background: 'transparent', color: 'inherit' }}
        />
      </label>

      <label style={row}>
        <span>{labels.font}</span>
        <select aria-label={labels.font} value={layer.font} disabled={disabled} onChange={e => onPatch({ font: e.target.value as OverlayLayer['font'] })}>
          {OVERLAY_FONTS.map(f => <option key={f} value={f}>{f === 'sans' ? labels.fontSans : f}</option>)}
        </select>
      </label>

      <Range label={labels.size} value={layer.size} min={0.02} max={0.2} step={0.005} disabled={disabled} onChange={size => onPatch({ size })} />
      <Range label={labels.boxWidth} value={layer.width} min={0.1} max={1} step={0.01} disabled={disabled} onChange={width => onPatch({ width })} />
      <Range label={labels.rotation} value={layer.rotation} min={-180} max={180} step={1} disabled={disabled} onChange={rotation => onPatch({ rotation })} />

      <div role="group" aria-label={labels.alignCenter} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {aligns.map(({ value, label, Icon }) => (
          <button key={value} type="button" aria-label={label} aria-pressed={layer.align === value} disabled={disabled} onClick={() => onPatch({ align: value })}
            style={{ padding: 6, borderRadius: 8, border: '1px solid rgba(127,127,127,.5)', background: layer.align === value ? 'var(--ov-accent, #2563eb)' : 'transparent', color: layer.align === value ? '#fff' : 'inherit', cursor: 'pointer' }}>
            <Icon size={16} aria-hidden />
          </button>
        ))}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginLeft: 8 }}>
          <input type="checkbox" checked={layer.weight === 'bold'} disabled={disabled} onChange={e => onPatch({ weight: e.target.checked ? 'bold' : 'normal' })} />
          {labels.bold}
        </label>
      </div>

      <label style={row}>
        <span>{labels.color}</span>
        <input type="color" aria-label={labels.color} value={layer.color} disabled={disabled} onChange={e => onPatch({ color: e.target.value.toLowerCase() })} />
      </label>

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" aria-label={labels.background} checked={layer.background !== null} disabled={disabled}
          onChange={e => onPatch({ background: e.target.checked ? { color: '#000000', opacity: 0.6 } : null })} />
        {labels.background}
        {layer.background && (
          <input type="color" aria-label={`${labels.background}: ${labels.color}`} value={layer.background.color} disabled={disabled}
            onChange={e => onPatch({ background: { color: e.target.value.toLowerCase(), opacity: layer.background?.opacity ?? 0.6 } })} />
        )}
      </label>
      {layer.background && (
        <Range label={labels.backgroundOpacity} value={layer.background.opacity} min={0} max={1} step={0.05} disabled={disabled}
          onChange={opacity => onPatch({ background: { color: layer.background?.color ?? '#000000', opacity } })} />
      )}

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" aria-label={labels.outline} checked={layer.outline !== null} disabled={disabled}
          onChange={e => onPatch({ outline: e.target.checked ? { color: '#000000', width: 0.08 } : null })} />
        {labels.outline}
        {layer.outline && (
          <input type="color" aria-label={`${labels.outline}: ${labels.color}`} value={layer.outline.color} disabled={disabled}
            onChange={e => onPatch({ outline: { color: e.target.value.toLowerCase(), width: layer.outline?.width ?? 0.08 } })} />
        )}
      </label>
      {layer.outline && (
        <Range label={labels.outlineWidth} value={layer.outline.width} min={0.01} max={0.2} step={0.01} disabled={disabled}
          onChange={width => onPatch({ outline: { color: layer.outline?.color ?? '#000000', width } })} />
      )}

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" aria-label={labels.shadow} checked={layer.shadow} disabled={disabled} onChange={e => onPatch({ shadow: e.target.checked })} />
        {labels.shadow}
      </label>
    </div>
  )
}

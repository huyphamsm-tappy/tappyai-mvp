'use client'
import type { ReactNode } from 'react'
import type { OverlayLayer } from '@/lib/media/video/overlay/schema'
import { layerBoxStyle, layerTextStyle } from './layerStyle'

/** One text layer, drawn from its JSON. Used by playback and by the editor (which adds its handles as `children`, so they rotate with the layer). */
export function TextLayerView({ layer, frameWidth, children, ...rest }: { layer: OverlayLayer; frameWidth: number; children?: ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'style'>) {
  return (
    <div data-layer-id={layer.id} {...rest} style={{ ...layerBoxStyle(layer), ...(rest.onPointerDown ? { touchAction: 'none', cursor: 'move' } : {}) }}>
      <span data-layer-text style={layerTextStyle(layer, frameWidth)}>{layer.text}</span>
      {children}
    </div>
  )
}

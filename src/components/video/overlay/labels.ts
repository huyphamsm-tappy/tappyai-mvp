// The words of the overlay editor. The text lives in the dictionaries (src/lib/i18n/video.ts, keys `video.overlay.*`); this builds the label object for the
// current language. A caller can still reword or translate by passing `labels` to the editor.

export interface OverlayLabels {
  editorTitle: string
  addText: string
  layers: string
  noLayers: string
  layerFallbackName: string
  remove: string
  moveUp: string
  moveDown: string
  text: string
  font: string
  fontSans: string
  size: string
  boxWidth: string
  rotation: string
  alignLeft: string
  alignCenter: string
  alignRight: string
  bold: string
  color: string
  background: string
  backgroundOpacity: string
  outline: string
  outlineWidth: string
  shadow: string
  timeline: string
  start: string
  end: string
  startHandle: string
  endHandle: string
  moveHandle: string
  scaleHandle: string
  rotateHandle: string
  tooManyLayers: string
  save: string
  saving: string
  saved: string
  conflict: string
  loadFailed: string
  saveFailed: string
  warningGlyphs: string
}

const LABEL_KEYS: (keyof OverlayLabels)[] = [
  'editorTitle', 'addText', 'layers', 'noLayers', 'layerFallbackName', 'remove', 'moveUp', 'moveDown', 'text', 'font', 'fontSans', 'size', 'boxWidth', 'rotation',
  'alignLeft', 'alignCenter', 'alignRight', 'bold', 'color', 'background', 'backgroundOpacity', 'outline', 'outlineWidth', 'shadow', 'timeline', 'start', 'end',
  'startHandle', 'endHandle', 'moveHandle', 'scaleHandle', 'rotateHandle', 'tooManyLayers', 'save', 'saving', 'saved', 'conflict', 'loadFailed', 'saveFailed', 'warningGlyphs',
]

/** The default labels in the language `t` speaks (`t` = the dictionary lookup of useTranslation). */
export function overlayLabels(t: (key: string) => string): OverlayLabels {
  const out = {} as OverlayLabels
  for (const k of LABEL_KEYS) out[k] = t(`video.overlay.${k}`)
  return out
}

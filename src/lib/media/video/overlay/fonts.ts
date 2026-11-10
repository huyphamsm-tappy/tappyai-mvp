// The fonts the server draws overlay text with (Explore video VID-02 / VID-04).
//
// WHY A BUNDLED FILE. Vercel's serverless runtime has no system fonts, so any text drawn there with a font NAME comes out as boxes. The repository's other server-side text
// (social cards) uses satori with a font fetched from Google at run time, which is a network dependency we do not want in a job that has to be deterministic and cached by
// content. Here sharp (already a dependency, with Pango and FreeType built in) draws the text from a font FILE that ships in the repository and is read from disk.
//
// FILES. Candidates are tried in order; the first whose files exist wins:
//   1. Be Vietnam Pro (OFL) — the brand font. Drop BeVietnamPro-Regular.ttf and BeVietnamPro-Bold.ttf into ./fonts to enable it (nothing else changes).
//   2. Noto Sans Regular (OFL, bundled): full Vietnamese coverage (checked on every precomposed letter), regular weight only, so BOLD is synthesised by growing the
//      glyph mask slightly (renderPng.ts) rather than by the text engine, which on a serverless image has no font configuration to synthesise it for us.
//      (The pdfjs "Liberation Sans" files in node_modules are a PDF subset with no Vietnamese and no combining marks: tried and rejected.)
// The renderer REFUSES text the chosen font cannot draw (OverlayGlyphError) instead of letting a fallback font or a box appear in somebody's download.
//
// Deployment note: the files are read with fs from process.cwd(); next.config.mjs must list ./src/lib/media/video/overlay/fonts/** and ./assets/** in
// outputFileTracingIncludes for the video download route, or they will not be in the function bundle.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { OverlayWeight } from './schema'

export const OVERLAY_ASSET_DIR = path.join(process.cwd(), 'src', 'lib', 'media', 'video', 'overlay')

interface FontFamilyFiles { family: string; regular: string; bold: string | null }
const CANDIDATES: readonly FontFamilyFiles[] = [
  { family: 'Be Vietnam Pro', regular: 'BeVietnamPro-Regular.ttf', bold: 'BeVietnamPro-Bold.ttf' },
  { family: 'Noto Sans', regular: 'NotoSans-Regular.ttf', bold: null },
]

/** `syntheticBold`: the file is a regular face and the caller must thicken the glyphs itself. */
export interface ResolvedFont { family: string; weight: OverlayWeight; file: string; syntheticBold: boolean }

/** The font file for `sans` at this weight, or null when no candidate is installed. */
export function resolveFont(weight: OverlayWeight, dir: string = path.join(OVERLAY_ASSET_DIR, 'fonts')): ResolvedFont | null {
  for (const c of CANDIDATES) {
    const regular = path.join(dir, c.regular)
    const bold = c.bold ? path.join(dir, c.bold) : null
    if (!existsSync(regular) || (bold && !existsSync(bold))) continue
    if (weight === 'bold' && bold) return { family: c.family, weight, file: bold, syntheticBold: false }
    return { family: c.family, weight, file: regular, syntheticBold: weight === 'bold' }
  }
  return null
}

const coverageCache = new Map<string, Set<number>>()

/** The set of code points a TrueType file maps to a glyph (cmap formats 4 and 12 — what every real font has). Cached per file. */
export function fontCodePoints(file: string): Set<number> {
  const cached = coverageCache.get(file)
  if (cached) return cached
  const buf = readFileSync(file)
  const set = new Set<number>()
  const tables = buf.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) {
    const o = 12 + i * 16
    if (buf.toString('ascii', o, o + 4) === 'cmap') cmap = buf.readUInt32BE(o + 8)
  }
  if (cmap >= 0) {
    const n = buf.readUInt16BE(cmap + 2)
    for (let i = 0; i < n; i++) {
      const sub = cmap + buf.readUInt32BE(cmap + 8 + i * 8)
      const format = buf.readUInt16BE(sub)
      if (format === 4) {
        const segX2 = buf.readUInt16BE(sub + 6)
        const ends = sub + 14
        const starts = ends + segX2 + 2
        for (let s = 0; s < segX2 / 2; s++) {
          const end = buf.readUInt16BE(ends + s * 2)
          for (let c = buf.readUInt16BE(starts + s * 2); c <= end && c < 0xffff; c++) set.add(c)
        }
      } else if (format === 12) {
        const groups = buf.readUInt32BE(sub + 12)
        for (let g = 0; g < groups; g++) {
          const start = buf.readUInt32BE(sub + 16 + g * 12)
          const end = buf.readUInt32BE(sub + 20 + g * 12)
          for (let c = start; c <= end && c - start < 70000; c++) set.add(c)
        }
      }
    }
  }
  coverageCache.set(file, set)
  return set
}

/** The characters in any of these texts that the installed overlay font cannot draw (empty when none, or when no font is installed: the renderer reports that itself). */
export function unsupportedInTexts(texts: string[]): string[] {
  const font = resolveFont('normal')
  if (!font) return []
  return [...new Set(texts.flatMap(t => unsupportedChars(t, font)))]
}

/**
 * The characters of `text` this font cannot draw. A precomposed letter counts as drawable when the font has it, or has its base letter and every combining mark (the
 * text shaper composes those); newline and spaces are always fine.
 */
export function unsupportedChars(text: string, font: ResolvedFont): string[] {
  const have = fontCodePoints(font.file)
  const missing = new Set<string>()
  for (const ch of text) {
    if (ch === '\n' || ch === ' ') continue
    const cp = ch.codePointAt(0) as number
    if (have.has(cp)) continue
    const parts = [...ch.normalize('NFD')]
    if (parts.length > 1 && parts.every(p => have.has(p.codePointAt(0) as number))) continue
    missing.add(ch)
  }
  return [...missing]
}

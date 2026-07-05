// Minimal, dependency-free QR Code generator (byte mode, versions 1–6, EC level M).
// Enough to encode a short profile URL (~≤106 bytes) into a scannable matrix rendered
// as inline SVG — no third-party library. Implements the standard ISO/IEC 18004 pipeline:
// data encoding → Reed–Solomon EC → block interleave → matrix + patterns → masking.
//
// Scope is intentionally bounded to versions 1–6 (data capacity 106 bytes at EC-M), which
// avoids QR "version information" modules (only required for v7+) while comfortably fitting
// any TappyAI profile URL. If content ever exceeds v6 capacity, encode() throws.

// ── Per-version (EC level M) parameters: [ecCodewordsPerBlock, numBlocks, totalDataCodewords] ──
const EC_M: Record<number, [number, number, number]> = {
  1: [10, 1, 16],
  2: [16, 1, 28],
  3: [26, 1, 44],
  4: [18, 2, 64],
  5: [24, 2, 86],
  6: [16, 4, 108],
}
// Alignment pattern centre coordinate (single extra coordinate besides 6) per version; v1 has none.
const ALIGN: Record<number, number> = { 2: 18, 3: 22, 4: 26, 5: 30, 6: 34 }
const REMAINDER_BITS: Record<number, number> = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7 }

// ── Galois field GF(256) tables (primitive polynomial 0x11d) ──
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
})()
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]])

// Reed–Solomon generator polynomial of the given degree.
function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1)
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i])
    }
    poly = next
  }
  return poly
}

// EC codewords for one data block.
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen)
  const res = new Array(ecLen).fill(0)
  for (const d of data) {
    const factor = d ^ res[0]
    res.shift()
    res.push(0)
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor)
  }
  return res
}

function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 6; v++) {
    // available data bits = dataCodewords*8; overhead = 4 (mode) + 8 (count, v1–9) + 4 (terminator, if room)
    const dataCodewords = EC_M[v][2]
    const capacityBytes = Math.floor((dataCodewords * 8 - 4 - 8) / 8)
    if (byteLen <= capacityBytes) return v
  }
  throw new Error('QR content too long for versions 1–6')
}

// ── Bit buffer ──
class Bits {
  arr: number[] = []
  put(val: number, len: number) { for (let i = len - 1; i >= 0; i--) this.arr.push((val >> i) & 1) }
}

// Build the interleaved final codeword sequence (data+EC) for the content.
function buildCodewords(text: string, version: number): number[] {
  const bytes = new TextEncoder().encode(text)
  const [ecPerBlock, numBlocks, totalData] = EC_M[version]

  const bb = new Bits()
  bb.put(0b0100, 4)           // byte mode
  bb.put(bytes.length, 8)     // char count (v1–9 → 8 bits)
  for (const b of bytes) bb.put(b, 8)
  // terminator (up to 4 bits) then byte-align
  const capacityBits = totalData * 8
  const term = Math.min(4, capacityBits - bb.arr.length)
  bb.put(0, term)
  while (bb.arr.length % 8 !== 0) bb.arr.push(0)
  // pad bytes
  const pads = [0xec, 0x11]
  let pi = 0
  while (bb.arr.length < capacityBits) { bb.put(pads[pi % 2], 8); pi++ }

  // to data codewords
  const dataCw: number[] = []
  for (let i = 0; i < bb.arr.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.arr[i + j]
    dataCw.push(v)
  }

  // split into equal blocks (v1–6 have uniform block sizes), compute EC per block
  const perBlock = totalData / numBlocks
  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  for (let b = 0; b < numBlocks; b++) {
    const block = dataCw.slice(b * perBlock, (b + 1) * perBlock)
    dataBlocks.push(block)
    ecBlocks.push(rsEncode(block, ecPerBlock))
  }

  // interleave data then EC
  const out: number[] = []
  for (let i = 0; i < perBlock; i++) for (const blk of dataBlocks) out.push(blk[i])
  for (let i = 0; i < ecPerBlock; i++) for (const blk of ecBlocks) out.push(blk[i])
  return out
}

type Grid = number[][] // 0/1 module; -1 = unset (function-pattern reserved handled via `reserved`)

function placeFunctionPatterns(size: number, version: number): { grid: Grid; reserved: boolean[][] } {
  const grid: Grid = Array.from({ length: size }, () => new Array(size).fill(0))
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (r: number, c: number, v: number) => { grid[r][c] = v; reserved[r][c] = true }

  // finder + separator at three corners
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
      const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6
      const isDark = inFinder && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
      set(rr, cc, isDark ? 1 : 0)
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0)

  // timing patterns
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0) }

  // alignment pattern (single, v2–6)
  if (ALIGN[version] !== undefined) {
    const coords = [6, ALIGN[version]]
    for (const ar of coords) for (const ac of coords) {
      // skip if overlapping a finder
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        const isDark = Math.max(Math.abs(r), Math.abs(c)) !== 1
        set(ar + r, ac + c, isDark ? 1 : 0)
      }
    }
  }

  // dark module + reserve format-info areas
  set(size - 8, 8, 1)
  for (let i = 0; i < 9; i++) { if (!reserved[8][i]) reserved[8][i] = true; if (!reserved[i][8]) reserved[i][8] = true }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 8 + i][8] = true }

  return { grid, reserved }
}

function placeData(grid: Grid, reserved: boolean[][], codewords: number[], size: number, remainder: number) {
  const bitsSeq: number[] = []
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bitsSeq.push((cw >> i) & 1)
  for (let i = 0; i < remainder; i++) bitsSeq.push(0)

  let idx = 0
  let upward = true
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5 // skip the vertical timing column so remaining pairs realign
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (const c of [col, col - 1]) {
        if (reserved[row][c]) continue
        grid[row][c] = idx < bitsSeq.length ? bitsSeq[idx] : 0
        idx++
      }
    }
    upward = !upward
  }
}

const MASKS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number, _c: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function applyMaskAndFormat(baseGrid: Grid, reserved: boolean[][], size: number, maskIdx: number): Grid {
  const g = baseGrid.map(row => row.slice())
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!reserved[r][c] && MASKS[maskIdx](r, c)) g[r][c] ^= 1
  }
  // format info: EC level M = 0b00 + 3 mask bits; BCH(15,5) remainder + XOR mask 0x5412
  const data = (0b00 << 3) | maskIdx
  let d = data << 10
  for (let i = 4; i >= 0; i--) if ((d >> (10 + i)) & 1) d ^= 0x537 << i
  const format = ((data << 10) | (d & 0x3ff)) ^ 0x5412
  const bit = (i: number) => (format >> i) & 1
  // copy 1 — bits 0-5 down column 8, bits 6-8 across the corner, bits 9-14 along row 8
  for (let i = 0; i <= 5; i++) g[i][8] = bit(i)
  g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8)
  for (let i = 9; i <= 14; i++) g[8][14 - i] = bit(i)
  // copy 2 — split across the other two corners; dark module at [size-8][8] preserved
  for (let i = 0; i <= 6; i++) g[size - 1 - i][8] = bit(i)         // vertical, bits 0-6
  for (let i = 7; i <= 14; i++) g[8][size - 8 + (i - 7)] = bit(i)  // horizontal, bits 7-14
  g[size - 8][8] = 1 // dark module
  return g
}

function penalty(g: Grid, size: number): number {
  let p = 0
  // rule 1: runs of ≥5 same colour
  for (let r = 0; r < size; r++) {
    let run = 1
    for (let c = 1; c < size; c++) {
      if (g[r][c] === g[r][c - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1
    for (let r = 1; r < size; r++) {
      if (g[r][c] === g[r - 1][c]) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
    }
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = g[r][c]
    if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) p += 3
  }
  // rule 3: finder-like pattern 1:1:3:1:1
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const check = (line: number[]) => {
    for (let i = 0; i + 11 <= line.length; i++) {
      let m1 = true, m2 = true
      for (let j = 0; j < 11; j++) { if (line[i + j] !== pat1[j]) m1 = false; if (line[i + j] !== pat2[j]) m2 = false }
      if (m1 || m2) p += 40
    }
  }
  for (let r = 0; r < size; r++) check(g[r])
  for (let c = 0; c < size; c++) check(g.map(row => row[c]))
  // rule 4: dark proportion
  let dark = 0
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += g[r][c]
  const ratio = (dark * 100) / (size * size)
  p += Math.floor(Math.abs(ratio - 50) / 5) * 10
  return p
}

/** Encode `text` into a QR module matrix (array of 0/1 rows). Throws if too long for v1–6. */
export function encodeQR(text: string, forceMask?: number): number[][] {
  const byteLen = new TextEncoder().encode(text).length
  const version = chooseVersion(byteLen)
  const size = version * 4 + 17
  const codewords = buildCodewords(text, version)

  const { grid: fnGrid, reserved } = placeFunctionPatterns(size, version)
  placeData(fnGrid, reserved, codewords, size, REMAINDER_BITS[version])

  if (forceMask !== undefined) return applyMaskAndFormat(fnGrid, reserved, size, forceMask)

  let best: Grid | null = null
  let bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    const masked = applyMaskAndFormat(fnGrid, reserved, size, m)
    const score = penalty(masked, size)
    if (score < bestScore) { bestScore = score; best = masked }
  }
  return best!
}

/** Render a QR matrix as a self-contained SVG string (no external assets). */
export function qrToSvg(matrix: number[][], opts?: { size?: number; margin?: number; dark?: string; light?: string }): string {
  const n = matrix.length
  const margin = opts?.margin ?? 2
  const total = n + margin * 2
  const px = opts?.size ?? 240
  const dark = opts?.dark ?? '#0f172a'
  const light = opts?.light ?? '#ffffff'
  let rects = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (matrix[r][c]) rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img"><rect width="${total}" height="${total}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`
}

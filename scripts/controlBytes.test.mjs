import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { scanDir, scanFile } from './controlBytes.mjs'

/**
 * The control-byte guard must FAIL on a raw 0x08 / 0x00 and pass on the escapes — proven on
 * fixtures, not on the (now clean) repo. It also runs the real tree: src/ and scripts/ clean.
 */
const ROOT = join(import.meta.dirname, '..')

describe('control-byte guard', () => {
  it('finds a raw backspace and a NUL with line and column, and ignores \\t \\n \\r and escapes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctrl-'))
    try {
      writeFileSync(join(dir, 'bad.ts'), Buffer.from('const a = 1\r\n\tconst re = /\x08(so)/\nconst s = `\x00x`\n', 'latin1'))
      writeFileSync(join(dir, 'good.ts'), 'const re = /\\b(so)/\nconst s = `\\u0000x`\t// tab is fine\r\n')
      writeFileSync(join(dir, 'skip.png'), Buffer.from([0x89, 0x50, 0x00, 0x08]))
      const out = scanDir(dir)
      expect(out).toHaveLength(1)
      expect(out[0].file.endsWith('bad.ts')).toBe(true)
      // line 2 = "\tconst re = /<0x08>(so)/" → the byte is the 14th character of the line.
      expect(out[0].hits.map(h => [h.line, h.col, h.byte])).toEqual([[2, 14, '0x08'], [3, 12, '0x00']])
      expect(scanFile(join(dir, 'good.ts'))).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('exits 1 with a file:line:col listing when run as a command on a dirty tree, 0 on a clean one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctrl-'))
    try {
      writeFileSync(join(dir, 'x.mjs'), Buffer.from('a\x1fb', 'latin1'))
      const bad = spawnSync(process.execPath, [join(ROOT, 'scripts', 'controlBytes.mjs'), dir], { encoding: 'utf8' })
      expect(bad.status).toBe(1)
      expect(bad.stderr).toMatch(/x\.mjs:1:2\s+0x1f/)
      writeFileSync(join(dir, 'x.mjs'), 'a\\x1fb')
      const ok = spawnSync(process.execPath, [join(ROOT, 'scripts', 'controlBytes.mjs'), dir], { encoding: 'utf8' })
      expect(ok.status).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('the repository itself is clean (src/ and scripts/)', () => {
    const hits = [...scanDir(join(ROOT, 'src')), ...scanDir(join(ROOT, 'scripts'))]
    expect(hits.map(h => `${h.file}: ${h.hits.map(x => `${x.line}:${x.col} ${x.byte}`).join(', ')}`)).toEqual([])
  })
})

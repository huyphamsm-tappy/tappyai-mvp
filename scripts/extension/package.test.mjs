import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { packageExtension, packageFileList, validateManifest, EXT_DIR } from './package.mjs'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

describe('extension store package', () => {
  it('validates the manifest against the permission model', () => {
    const m = validateManifest(EXT_DIR)
    expect(m.manifest_version).toBe(3)
    expect(() => validateManifest(EXT_DIR, '9.9.9')).toThrow(/manifest version/)
  })

  it('includes exactly the runtime files and nothing from the store kit or docs', () => {
    const rels = packageFileList().map((f) => f.rel)
    expect(rels).toContain('manifest.json')
    expect(rels).toContain('background.js')
    expect(rels).toContain('src/links.js')
    expect(rels).toContain('_locales/vi/messages.json')
    expect(rels).toContain('icons/icon-128.png')
    expect(rels.some((r) => r.startsWith('store/') || r.endsWith('.md') || r.startsWith('dist/'))).toBe(false)
  })

  it('writes a zip named by the manifest version whose entries match the file list, deterministically', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-ext-'))
    const a = await packageExtension({ outDir: out })
    expect(path.basename(a.outFile)).toBe(`tappyai-extension-${a.version}.zip`)
    const zip = await JSZip.loadAsync(fs.readFileSync(a.outFile))
    expect(Object.keys(zip.files).filter((k) => !zip.files[k].dir).sort()).toEqual([...a.files].sort())
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
    expect(manifest.version).toBe(a.version)
    const b = await packageExtension({ outDir: out })
    expect(fs.readFileSync(a.outFile).equals(fs.readFileSync(b.outFile))).toBe(true)
    fs.rmSync(out, { recursive: true, force: true })
  })
})

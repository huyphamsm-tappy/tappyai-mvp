// Package the browser extension for store upload (Chrome Web Store, Edge
// Add-ons, Firefox AMO all accept the same zip).
//
//   npm run extension:package            → extensions/browser/dist/tappyai-extension-<version>.zip
//   node scripts/extension/package.mjs --out <dir>
//
// Deterministic: includes exactly the runtime files (manifest, scripts,
// popup, locales, icons); excludes docs, the store kit and anything not
// referenced by the manifest. Refuses to package if the manifest's version
// does not match the web app's EXTENSION_VERSION constant, or if a forbidden
// permission has crept in — the same rules the vitest suite pins.
//
// Uses jszip (already in node_modules as a transitive dependency); no new
// package is added.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const here = path.dirname(fileURLToPath(import.meta.url))
export const EXT_DIR = path.resolve(here, '..', '..', 'extensions', 'browser')

/** Runtime files, relative to EXT_DIR. Directories are included recursively. */
export const INCLUDE = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'popup.css', 'src', '_locales', 'icons']
export const ALLOWED_PERMISSIONS = new Set(['activeTab', 'contextMenus', 'storage'])

function walk(dir, base, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = path.posix.join(base, name)
    if (fs.statSync(full).isDirectory()) walk(full, rel, out)
    else out.push({ rel, full })
  }
  return out
}

/** The file list the zip will contain (posix paths). Pure over the filesystem. */
export function packageFileList(extDir = EXT_DIR) {
  const files = []
  for (const entry of INCLUDE) {
    const full = path.join(extDir, entry)
    if (!fs.existsSync(full)) throw new Error(`missing ${entry}`)
    if (fs.statSync(full).isDirectory()) walk(full, entry, files)
    else files.push({ rel: entry, full })
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** Validate the manifest against the permission model and the web constant. Throws on violation. */
export function validateManifest(extDir = EXT_DIR, expectedVersion) {
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'))
  if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3')
  for (const p of manifest.permissions ?? []) if (!ALLOWED_PERMISSIONS.has(p)) throw new Error(`forbidden permission: ${p}`)
  if ((manifest.host_permissions ?? []).length) throw new Error('host_permissions must be empty')
  if (manifest.content_scripts) throw new Error('content_scripts are not allowed')
  if (expectedVersion && manifest.version !== expectedVersion) throw new Error(`manifest version ${manifest.version} != expected ${expectedVersion}`)
  return manifest
}

/** Build the zip bytes. */
export async function buildZip(extDir = EXT_DIR) {
  const zip = new JSZip()
  // Fixed timestamps so two builds of the same tree are byte-identical.
  const date = new Date('2026-01-01T00:00:00Z')
  for (const { rel, full } of packageFileList(extDir)) zip.file(rel, fs.readFileSync(full), { date })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

export async function packageExtension({ extDir = EXT_DIR, outDir = path.join(EXT_DIR, 'dist'), expectedVersion } = {}) {
  const manifest = validateManifest(extDir, expectedVersion)
  const bytes = await buildZip(extDir)
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `tappyai-extension-${manifest.version}.zip`)
  fs.writeFileSync(outFile, bytes)
  return { outFile, bytes: bytes.length, version: manifest.version, files: packageFileList(extDir).map((f) => f.rel) }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const outIdx = process.argv.indexOf('--out')
  const outDir = outIdx > -1 ? path.resolve(process.argv[outIdx + 1]) : undefined
  packageExtension({ outDir }).then((r) => {
    console.log(`packaged ${r.files.length} files → ${r.outFile} (${r.bytes} bytes, v${r.version})`)
  }).catch((e) => { console.error(e.message); process.exit(1) })
}

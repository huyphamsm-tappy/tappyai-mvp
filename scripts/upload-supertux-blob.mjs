/**
 * One-off script: upload SuperTux large binary assets to Vercel Blob storage.
 *
 * Run once after the Blob store is linked to the project:
 *   npx vercel env pull .env.local    # pull BLOB_READ_WRITE_TOKEN
 *   node scripts/upload-supertux-blob.mjs
 *
 * Or set the token inline:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx node scripts/upload-supertux-blob.mjs
 *
 * After running, copy the printed env vars into Vercel → Project → Environment Variables,
 * then redeploy.
 */

import { put } from '@vercel/blob'
import { readFile, writeFile, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// Parse .env.local manually (no dotenv dependency needed)
async function loadEnvLocal() {
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const text = await readFile(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const FILES = [
  {
    src: join(process.cwd(), 'public/games/supertux/supertux2.data'),
    name: 'supertux2.data',
    contentType: 'application/octet-stream',
    envKey: 'NEXT_PUBLIC_SUPERTUX_DATA_URL',
  },
  {
    src: join(process.cwd(), 'public/games/supertux/supertux2.wasm'),
    name: 'supertux2.wasm',
    contentType: 'application/wasm',
    envKey: 'NEXT_PUBLIC_SUPERTUX_WASM_URL',
  },
]

async function main() {
  await loadEnvLocal()

  const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
  if (!TOKEN) {
    console.error('ERROR: BLOB_READ_WRITE_TOKEN is not set.')
    console.error('Options:')
    console.error('  npx vercel env pull .env.local   # requires vercel login')
    console.error('  BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx node scripts/upload-supertux-blob.mjs')
    process.exit(1)
  }

  const results = {}

  for (const file of FILES) {
    if (!existsSync(file.src)) {
      console.error(`ERROR: ${file.src} not found — run from project root.`)
      process.exit(1)
    }
    const { size } = await stat(file.src)
    const sizeMB = (size / 1024 / 1024).toFixed(1)
    console.log(`Uploading ${file.name} (${sizeMB} MB)…`)

    const content = await readFile(file.src)
    const blob = await put(file.name, content, {
      access: 'public',
      contentType: file.contentType,
      token: TOKEN,
    })

    results[file.envKey] = blob.url
    console.log(`  done: ${blob.url}`)
  }

  console.log('\n=== Set these in Vercel → Project → Settings → Environment Variables ===')
  for (const [key, url] of Object.entries(results)) {
    console.log(`${key}=${url}`)
  }

  const envLines = Object.entries(results).map(([k, v]) => `${k}=${v}`).join('\n')
  await writeFile(join(process.cwd(), '.blob-urls.env'), envLines + '\n', 'utf-8')
  console.log('\nAlso written to .blob-urls.env for reference (not committed).')
}

main().catch(err => {
  console.error('Upload failed:', err.message)
  process.exit(1)
})

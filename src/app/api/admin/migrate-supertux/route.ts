/**
 * TEMPORARY one-shot migration route — DELETE after use.
 * Uploads supertux2.data and supertux2.wasm to Vercel Blob storage.
 * Protected by a simple guard key (not a real secret, just avoids accidental calls).
 *
 * Call: GET /api/admin/migrate-supertux?key=st-migrate-k7x9p2m4
 * Returns: JSON with blob URLs + env var instructions.
 */

import { put } from '@vercel/blob'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'

// Simple guard — prevents accidental calls; not a real secret (it's in source code).
const GUARD_KEY = 'st-migrate-k7x9p2m4'

// Allow up to 5 minutes — uploading 245 MB needs headroom even on fast internal network.
export const maxDuration = 300

// Vercel auto-provisions the token under one of these names depending on store count/name.
function findBlobToken(): string | undefined {
  // Primary store (only one store in project)
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN
  // Named store: "tappyai-mvp-blob" → TAPPYAI_MVP_BLOB
  if (process.env.BLOB_READ_WRITE_TOKEN_TAPPYAI_MVP_BLOB)
    return process.env.BLOB_READ_WRITE_TOKEN_TAPPYAI_MVP_BLOB
  return undefined
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  if (searchParams.get('key') !== GUARD_KEY) {
    return Response.json({ error: 'Forbidden — pass ?key=...' }, { status: 403 })
  }

  // Diagnostic: show which BLOB_* env vars exist (names only, never values)
  const blobEnvKeys = Object.keys(process.env).filter(k => k.includes('BLOB'))

  const token = findBlobToken()
  if (!token) {
    return Response.json(
      {
        error: 'No BLOB_READ_WRITE_TOKEN found — Blob store may not be linked to this project yet.',
        hint: 'Go to Vercel → Storage → tappyai-mvp-blob → Connect to Project, then redeploy.',
        blobEnvKeysFound: blobEnvKeys,
      },
      { status: 500 }
    )
  }

  const files = [
    {
      name: 'supertux2.data',
      contentType: 'application/octet-stream',
      envKey: 'NEXT_PUBLIC_SUPERTUX_DATA_URL',
    },
    {
      name: 'supertux2.wasm',
      contentType: 'application/wasm',
      envKey: 'NEXT_PUBLIC_SUPERTUX_WASM_URL',
    },
  ]

  const log: string[] = []
  const envVars: Record<string, string> = {}

  for (const file of files) {
    const filePath = join(process.cwd(), 'public', 'games', 'supertux', file.name)

    try {
      const { size } = await stat(filePath)
      log.push(`${file.name}: reading ${(size / 1024 / 1024).toFixed(1)} MB from filesystem…`)

      const content = await readFile(filePath)
      log.push(`${file.name}: uploading to Blob store…`)

      const blob = await put(file.name, content, {
        access: 'public',
        contentType: file.contentType,
        token,
        addRandomSuffix: false,
      })

      envVars[file.envKey] = blob.url
      log.push(`${file.name}: done — ${blob.url}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.push(`${file.name}: FAILED — ${msg}`)
      return Response.json({ success: false, log, error: msg }, { status: 500 })
    }
  }

  return Response.json({
    success: true,
    log,
    envVars,
    nextStep: 'Set these two env vars in Vercel → Project → Settings → Environment Variables, then redeploy.',
  })
}

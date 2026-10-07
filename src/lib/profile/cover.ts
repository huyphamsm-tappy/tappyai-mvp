// Profile cover — the ONE client path for changing it.
//
// Two screens offer the control (the edit form and the owner's own Explore
// profile); both go through here so validation, the endpoint and the response
// shape cannot drift. The server is `POST /api/profile` with a `cover` file
// (same route, same magic-byte check as the avatar) and `PATCH /api/profile`
// with `cover_url: null` to clear. Nothing here chooses a URL: the server
// writes the object and reports where it landed.

import { MAX_PHOTO_SIZE_MB } from '@/lib/config/product'

export const COVER_MAX_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024

export type CoverRejection = 'tooLarge' | 'notImage'

/** Client-side pre-check so an obviously wrong file never leaves the device. The server re-checks by content. */
export function rejectCoverFile(file: File): CoverRejection | null {
  if (!file.type.startsWith('image/')) return 'notImage'
  if (file.size > COVER_MAX_BYTES) return 'tooLarge'
  return null
}

export class CoverRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'CoverRequestError'
    this.status = status
  }
}

async function readBody(res: Response): Promise<{ cover_url?: string | null; message?: string; ok?: boolean }> {
  try { return await res.json() } catch { return {} }
}

/** Upload a new cover (replace when one exists). Resolves to the public URL the server stored. */
export async function uploadCover(file: File): Promise<string> {
  const body = new FormData()
  body.append('cover', file)
  const res = await fetch('/api/profile', { method: 'POST', body })
  const data = await readBody(res)
  // `fetch` resolves on 4xx/5xx — the status is the verdict, not the resolution.
  if (!res.ok || typeof data.cover_url !== 'string') throw new CoverRequestError(res.status, data.message || '')
  return data.cover_url
}

/** Remove the cover. The profile falls back to the decorative gradient. */
export async function removeCover(): Promise<void> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover_url: null }),
  })
  if (!res.ok) {
    const data = await readBody(res)
    throw new CoverRequestError(res.status, data.message || '')
  }
}

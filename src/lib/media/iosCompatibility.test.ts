// iOS must speak the same media protocol as the web client.
//
// There is no Xcode on this machine, so nothing here claims an iOS build. What
// it does do is guard the contract that actually broke: iOS hand-rolled Vercel
// Blob's client-token protocol — asking for `blob.generate-client-token`, then
// building `https://<storeId>.public.blob.vercel-storage.com/<pathname>` itself.
//
// With MEDIA_PROVIDER=gcs the server refuses that handshake with 409 (on
// purpose: it is the one path that would mint a client-chosen object name), so
// every iOS video, thumbnail and audio upload fails at the first request. A
// source-level guard is a weak substitute for a device test, but it is a real
// regression gate and it runs in CI — which is more than an unbuildable target
// gets otherwise.
//
// Read paths are deliberately NOT covered: iOS renders whatever absolute URL
// the server returns, so they were never provider-specific.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const iosRoot = join(root, 'ios')

/** Every Swift file under ios/. */
function swiftFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) swiftFiles(p, out)
    else if (entry.endsWith('.swift')) out.push(p)
  }
  return out
}

const files = swiftFiles(iosRoot)
const read = (p: string) => readFileSync(p, 'utf8')

/** The two services that perform client-direct uploads. */
const UPLOAD_SERVICES = [
  join(iosRoot, 'TappyAI', 'Features', 'Reviews', 'Data', 'CreateReviewService.swift'),
  join(iosRoot, 'TappyAI', 'Features', 'Music', 'Data', 'MusicService.swift'),
]

describe('iOS carries no provider-specific media assumptions', () => {
  it('has Swift sources to check at all', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  // The literal that pins iOS to one storage vendor.
  it('no Swift file builds a Vercel Blob URL', () => {
    const offenders = files.filter((f) => /blob\.vercel-storage\.com/.test(read(f)))
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([])
  })

  // Refused with 409 once GCS is active — so using it is a guaranteed failure.
  it('no Swift file requests a Vercel Blob client token', () => {
    const offenders = files.filter((f) => /blob\.generate-client-token/.test(read(f)))
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([])
  })

  it('no Swift file parses a store id out of an upload token', () => {
    const offenders = files.filter((f) => /extractStoreId/.test(read(f)))
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([])
  })
})

describe('iOS client-direct uploads use the shared session protocol', () => {
  it.each(UPLOAD_SERVICES)('%s opens a server-owned upload session', (path) => {
    const src = read(path)
    expect(src).toContain('media.create-upload-session')
  })

  // Without this the app would persist a URL for an upload it never confirmed.
  it.each(UPLOAD_SERVICES)('%s confirms the upload with the server', (path) => {
    const src = read(path)
    expect(src).toContain('media.complete-upload')
  })

  // The server owns the object name. iOS must not propose one.
  it.each(UPLOAD_SERVICES)('%s sends no client-chosen pathname', (path) => {
    const src = read(path)
    expect(src).not.toMatch(/"pathname"\s*:/)
  })

  // Rollback must stay safe. Unsetting MEDIA_PROVIDER puts the server back on a
  // provider with no session protocol, and iOS must refuse rather than invent
  // an upload path the server never offered.
  it.each(UPLOAD_SERVICES)('%s only uploads when the server said gcs', (path) => {
    const src = read(path)
    expect(src).toMatch(/provider\s*==\s*"gcs"/)
  })

  // The upload URL is a one-object capability; it must never be what gets
  // stored. Only the completion verdict's URL is persisted.
  it.each(UPLOAD_SERVICES)('%s never returns the session URI as the media URL', (path) => {
    const src = read(path)
    expect(src).not.toMatch(/return\s+.*uploadUrl/)
  })
})

// The video file-size limit, and the one byte ceiling every platform must agree on.
//
// CONVENTION (pre-existing, deliberately preserved): every layer multiplies the configured
// megabyte count by 1024 * 1024 — binary MiB, not decimal MB. `uploadPolicy.ts` names it `MB`,
// the composer and the iOS `UploadLimits` spell it out inline. So the configured 150 means
// 150 * 1024 * 1024 = 157,286,400 bytes, NOT 150,000,000. Changing the convention would move the
// boundary by 7.3MB without anyone editing a limit, so it is pinned here rather than assumed.
//
// The comparison is `size > maxBytes` (server) and `file.size > MAX_VIDEO_SIZE` (composer), so the
// ceiling is INCLUSIVE: exactly 157,286,400 bytes is accepted and one byte more is not.
//
// Duration is a separate contract and lives in videoDuration.test.ts — nothing here may move it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_VIDEO_SIZE_MB } from './product'
import {
  MEDIA_UPLOAD_POLICIES,
  MediaUploadRejectedError,
  resolveUploadTarget,
} from '@/lib/media/uploadPolicy'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

/** The exact ceiling this repository's convention produces. */
const CEILING_BYTES = 157_286_400
const MiB = 1024 * 1024
const OWNER = 'f9077a52-b0f3-453a-a497-97da115ae386'

// "150MB" CONTAINS the substring "50MB", so a plain `not.toContain('50MB')` passes the moment the
// copy is corrected — it would go green without proving anything. The leading \b is what makes this
// a real guard: it needs a non-word character before the 5, which "150MB" does not have.
const STALE_50MB = /\b50MB/

const resolve = (sizeBytes: number) =>
  resolveUploadTarget({ kind: 'video', contentType: 'video/mp4', sizeBytes, ownerId: OWNER }, ['video'])

describe('the stale-copy guard itself', () => {
  // Without this, a broken STALE_50MB would silently pass every "no stale copy" test below.
  it('catches the old copy and tolerates the new', () => {
    expect('mp4 · mov · webm  ·  up to 5 minutes · 50MB').toMatch(STALE_50MB)
    expect('Video must be under 50MB').toMatch(STALE_50MB)
    expect('mp4 · mov · webm  ·  up to 5 minutes · 150MB').not.toMatch(STALE_50MB)
    expect('Please choose a video up to 150MB.').not.toMatch(STALE_50MB)
  })
})

describe('the configured video size limit', () => {
  it('is 150 megabytes', () => {
    expect(MAX_VIDEO_SIZE_MB).toBe(150)
  })

  it('uses the binary convention, so 150 means 157,286,400 bytes', () => {
    expect(MAX_VIDEO_SIZE_MB * MiB).toBe(CEILING_BYTES)
    // Guards the convention itself: a switch to decimal MB would land on 150,000,000.
    expect(MAX_VIDEO_SIZE_MB * MiB).not.toBe(150_000_000)
  })

  it('is the number the server policy enforces', () => {
    expect(MEDIA_UPLOAD_POLICIES.video.maxBytes).toBe(CEILING_BYTES)
  })
})

describe('the size acceptance boundary, through the server predicate', () => {
  it.each([
    ['a small clip', 1],
    ['1MB', 1 * MiB],
    ['50MB — the old limit', 50 * MiB],
    ['100MB', 100 * MiB],
    ['149MB', 149 * MiB],
    ['exactly 150MB', CEILING_BYTES],
  ])('accepts %s', (_label, bytes) => {
    expect(() => resolve(bytes)).not.toThrow()
  })

  it.each([
    ['150MB plus one byte', CEILING_BYTES + 1],
    ['151MB', 151 * MiB],
    ['200MB', 200 * MiB],
    ['1GB', 1024 * MiB],
  ])('rejects %s', (_label, bytes) => {
    expect(() => resolve(bytes)).toThrow(MediaUploadRejectedError)
  })

  it('rejects the over-limit case as TOO_LARGE with a 413, not a generic 400', () => {
    try {
      resolve(CEILING_BYTES + 1)
      expect.unreachable('a video one byte over the ceiling must be rejected')
    } catch (e) {
      expect(e).toBeInstanceOf(MediaUploadRejectedError)
      expect((e as MediaUploadRejectedError).code).toBe('TOO_LARGE')
      expect((e as MediaUploadRejectedError).status).toBe(413)
    }
  })

  it('names the new limit in the rejection message, derived rather than hardcoded', () => {
    try {
      resolve(CEILING_BYTES + 1)
      expect.unreachable('expected a rejection')
    } catch (e) {
      expect((e as Error).message).toContain('150MB')
      expect((e as Error).message).not.toMatch(STALE_50MB)
    }
    // Derived from the policy, so the message cannot drift from the number it enforces.
    const src = read('src/lib/media/uploadPolicy.ts')
    expect(src).toMatch(/Math\.floor\(policy\.maxBytes \/ MB\)/)
  })

  // An unreadable size must not sail through as "under the limit".
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('still rejects the unusable size %s', (bytes) => {
    expect(() => resolve(bytes)).toThrow(MediaUploadRejectedError)
  })
})

describe('raising video does not move any other upload limit', () => {
  it.each([
    ['videoThumbnail', 10 * MiB],
    ['audio', 20 * MiB],
    ['audioCover', 5 * MiB],
    ['dealLogo', 5 * MiB],
    ['dealBanner', 5 * MiB],
  ] as const)('%s stays at its own ceiling', (kind, bytes) => {
    expect(MEDIA_UPLOAD_POLICIES[kind].maxBytes).toBe(bytes)
  })

  it('leaves the iOS photo limit alone', () => {
    const ios = read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')
    expect(ios).toMatch(/maxPhotoSizeBytes\s*=\s*5 \* 1024 \* 1024/)
  })
})

describe('the web composer reads the shared limit rather than its own', () => {
  const page = () => read('src/app/reviews/new/page.tsx')

  it('derives its byte ceiling from the shared config', () => {
    expect(page()).toContain('MAX_VIDEO_SIZE_MB')
    expect(page()).toMatch(/MAX_VIDEO_SIZE\s*=\s*MAX_VIDEO_SIZE_MB \* 1024 \* 1024/)
  })

  it('rejects strictly above the ceiling, so exactly 150MB is still accepted', () => {
    expect(page()).toMatch(/file\.size\s*>\s*MAX_VIDEO_SIZE/)
    expect(page()).not.toMatch(/file\.size\s*>=\s*MAX_VIDEO_SIZE/)
  })

  it('carries no stale 50MB claim, including in comments', () => {
    expect(page()).not.toMatch(STALE_50MB)
  })
})

describe('the API config contract', () => {
  it('keeps exposing the existing field rather than a duplicate key', () => {
    const route = read('src/app/api/config/route.ts')
    expect(route).toMatch(/maxVideoSizeMb:\s*MAX_VIDEO_SIZE_MB/)
    expect(route).not.toContain('videoMaxSizeMb')
  })
})

describe('iOS pins the same number', () => {
  const model = () => read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')

  it('advertises 150MB', () => {
    expect(model()).toMatch(/maxVideoSizeMB\s*=\s*150\b/)
    expect(model()).not.toMatch(/maxVideoSizeMB\s*=\s*50\b/)
  })

  it('derives bytes with the same binary convention', () => {
    expect(model()).toMatch(/maxVideoSizeBytes\s*=\s*maxVideoSizeMB \* 1024 \* 1024/)
  })

  it('accepts a file exactly at the ceiling', () => {
    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).toMatch(/fileSize\s*<=\s*UploadLimits\.maxVideoSizeBytes/)
  })

  it('localizes the size error instead of hardcoding it', () => {
    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).toContain('review.video.tooLarge')
    expect(vm).not.toMatch(/\d+MB/)
  })

  it('leaves no stale 50MB string in the catalog', () => {
    expect(read('ios/TappyAI/Resources/Localizable.xcstrings')).not.toMatch(STALE_50MB)
  })

  it('states the new size in both languages', () => {
    const cat = read('ios/TappyAI/Resources/Localizable.xcstrings')
    expect(cat).toContain('Video is too large. Please choose a video up to 150MB.')
    expect(cat).toContain('Video quá lớn. Vui lòng chọn video tối đa 150MB.')
  })
})

describe('Android has no video size limit to keep in sync', () => {
  // Re-audited for this change: every Android media picker is ImageOnly and nothing calls
  // /api/upload/video, so there is no size rule there to raise. This guard is what makes that a
  // checked fact rather than a claim — if a video picker appears later, it fails and whoever adds
  // it has to wire the shared limit at the same time.
  const androidSources = () => {
    const { globSync } = require('tinyglobby') as typeof import('tinyglobby')
    return globSync(['android/app/src/main/**/*.kt'], { cwd: root })
  }

  it('finds Android sources, so the guard is not vacuous', () => {
    expect(androidSources().length).toBeGreaterThan(50)
  })

  it('declares no video size constant anywhere', () => {
    const offenders = androidSources().filter((f) => /maxVideoSize|MAX_VIDEO_SIZE/i.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('shows no video upload size copy in either language', () => {
    const { globSync } = require('tinyglobby') as typeof import('tinyglobby')
    const strings = globSync(['android/app/src/main/res/values*/strings.xml'], { cwd: root })
    expect(strings.length).toBeGreaterThan(0)
    const offenders = strings.filter((f) => /50MB|150MB/i.test(read(f)))
    expect(offenders).toEqual([])
  })
})

describe('EN and VI both state the new size', () => {
  const dict = () => read('src/lib/i18n/w2/reviewNew.ts')

  it.each(['reviewNew.videoTooLarge', 'reviewNew.videoLimitHint', 'reviewNew.videoHint'])(
    '%s exists in both languages',
    (key) => {
      expect(dict().split(`'${key}'`).length - 1).toBe(2)
    }
  )

  it('carries no stale 50MB copy', () => {
    expect(dict()).not.toMatch(STALE_50MB)
  })

  it('states the size rejection in both languages', () => {
    expect(dict()).toContain('Video is too large. Please choose a video up to 150MB.')
    expect(dict()).toContain('Video quá lớn. Vui lòng chọn video tối đa 150MB.')
  })

  it('states both limits together in the picker hint', () => {
    expect(dict()).toContain('Videos can be up to 5 minutes long and 150MB.')
    expect(dict()).toContain('Bạn có thể tải video dài tối đa 5 phút và 150MB.')
  })

  it('keeps the size in the format line too', () => {
    expect(dict()).toContain('up to 5 minutes · 150MB')
    expect(dict()).toContain('tối đa 5 phút · 150MB')
  })
})

describe('the duration contract is untouched by this change', () => {
  it('still advertises 300 and accepts 305', () => {
    const src = read('src/lib/config/product.ts')
    expect(src).toMatch(/MAX_VIDEO_DURATION_SEC\s*=\s*300\b/)
    expect(src).toMatch(/MAX_VIDEO_DURATION_ACCEPT_SEC\s*=\s*305\b/)
  })

  it('still says five minutes, and names 5:05 only in the failure', () => {
    const dict = read('src/lib/i18n/w2/reviewNew.ts')
    expect(dict).toContain('5 minutes 5 seconds')
    expect(dict).toContain('5 phút 5 giây')
  })
})

// The per-photo size limit — the one upload rule the clients could not read.
//
// Phase 7 remediation §5 ("UI = client = server = documented rule"). Measured before the fix:
//
//   · `MAX_PHOTO_SIZE_MB` = 5 was enforced by POST /api/reviews/upload and POST /api/profile,
//   · the composer displayed it (`reviewNew.photoHint`),
//   · but GET /api/config served `maxPhotosPerReview`, `maxVideoSizeMb` and both duration values
//     and NOT this one — so iOS carried its own `5 * 1024 * 1024` literal in `UploadLimits`,
//   · and the failure copy was `media.imageTooLarge5`: the number 5 baked into BOTH the key name
//     and the Vietnamese and English strings.
//
// Raising the constant would therefore have left iOS rejecting at 5MB and the server telling every
// user "nhỏ hơn 5MB" while enforcing something else. Three layers, one number, pinned here.
//
// Binary megabytes, same convention as videoSize.test.ts: the configured count is multiplied by
// 1024 * 1024 everywhere, and the comparison is `size > maxBytes`, so the ceiling is INCLUSIVE.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_PHOTO_SIZE_MB } from './product'
import { GET } from '@/app/api/config/route'
import { serverMessage } from '@/lib/i18n/serverMessages'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('GET /api/config serves the photo ceiling', () => {
  it('sends maxPhotoSizeMb, and it is the constant the server enforces', async () => {
    const body = await (await GET()).json()
    expect(body.upload.maxPhotoSizeMb).toBe(MAX_PHOTO_SIZE_MB)
  })

  it('still sends the upload rules it already sent', async () => {
    const body = await (await GET()).json()
    for (const k of ['maxPhotosPerReview', 'maxVideoSizeMb', 'maxVideoDurationSec', 'maxVideoDurationAcceptSec']) {
      expect(typeof body.upload[k]).toBe('number')
    }
  })
})

describe('the rejection message carries the real limit', () => {
  it('interpolates the number instead of naming one', () => {
    const n = String(MAX_PHOTO_SIZE_MB)
    expect(serverMessage('media.imageTooLarge', 'vi', { n })).toContain(`${n}MB`)
    expect(serverMessage('media.imageTooLarge', 'en', { n })).toContain(`${n}MB`)
  })

  // The defect this replaces: the literal lived in the key name AND the copy. A key ending in a
  // digit is how a limit silently stops matching its own message.
  it('no message key bakes the megabyte count into its name', () => {
    expect(read('src/lib/i18n/serverMessages.ts')).not.toContain('media.imageTooLarge5')
  })

  it('both enforcing routes pass the constant', () => {
    for (const rel of ['src/app/api/reviews/upload/route.ts', 'src/app/api/profile/route.ts']) {
      const src = read(rel)
      expect(src).toContain('MAX_PHOTO_SIZE_MB')
      expect(src).toContain("serverMessage('media.imageTooLarge', requestLocale(req), { n: String(MAX_PHOTO_SIZE_MB) })")
    }
  })
})

describe('Android mirrors the same number', () => {
  const kt = read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt')

  it('the composer names the megabyte count, and it matches web', () => {
    const m = kt.match(/const val MAX_PHOTO_SIZE_MB = (\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(MAX_PHOTO_SIZE_MB)
  })

  it('the byte count is derived, not a second literal', () => {
    expect(kt).toContain('const val MAX_PHOTO_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024')
    expect(kt).not.toContain('MAX_PHOTO_BYTES = 5 * 1024 * 1024')
  })
})

describe('iOS mirrors the same number', () => {
  const swift = read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')

  it('UploadLimits names the megabyte count, and it matches web', () => {
    const m = swift.match(/static let maxPhotoSizeMB = (\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(MAX_PHOTO_SIZE_MB)
  })

  it('the byte count is derived, not a second literal', () => {
    expect(swift).toContain('static let maxPhotoSizeBytes = maxPhotoSizeMB * 1024 * 1024')
    expect(swift).not.toContain('maxPhotoSizeBytes = 5 * 1024 * 1024')
  })

  it('AppConfigService can decode the new field', () => {
    expect(read('ios/TappyAI/Core/Config/AppConfigService.swift')).toContain('let maxPhotoSizeMb: Int?')
  })
})

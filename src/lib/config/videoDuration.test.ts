// The 5-minute video limit, and the one boundary every platform must agree on.
//
// Two numbers, deliberately different:
//   MAX_VIDEO_DURATION_SEC        = 300  the product limit — what the user is told
//   MAX_VIDEO_DURATION_ACCEPT_SEC = 305  the acceptance ceiling — what validation uses
//
// The gap exists because a clip a user trimmed to "5 minutes" routinely encodes at 300.04s, and
// rejecting that reads as a bug. The tolerance is a validation detail; UI copy says five minutes.
//
// Every client pre-validates for UX, so the risk is drift: web accepting 305 while iOS still stops
// at 62 is invisible until a user hits it. These tests pin the shared predicate, and the source
// contracts below pin the native clients to the same numbers.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_DURATION_ACCEPT_SEC,
  isAcceptableVideoDuration,
} from './product'

const root = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('the two limits are what the product asked for', () => {
  it('advertises five minutes', () => {
    expect(MAX_VIDEO_DURATION_SEC).toBe(300)
  })

  it('accepts up to five minutes five seconds', () => {
    expect(MAX_VIDEO_DURATION_ACCEPT_SEC).toBe(305)
  })

  it('keeps the tolerance at five seconds', () => {
    expect(MAX_VIDEO_DURATION_ACCEPT_SEC - MAX_VIDEO_DURATION_SEC).toBe(5)
  })
})

describe('the acceptance boundary', () => {
  it.each([1, 15, 59, 60, 61, 62, 63, 299, 300, 304, 305])('accepts %ss', (sec) => {
    expect(isAcceptableVideoDuration(sec)).toBe(true)
  })

  it.each([305.01, 305.1, 306, 400, 3600])('rejects %ss', (sec) => {
    expect(isAcceptableVideoDuration(sec)).toBe(false)
  })

  // 305.004 rounds to 305.00 at two decimals but is still over. Rejecting it is correct and
  // deliberate: the tolerance already absorbs encoder drift, so nothing needs a second fudge.
  it('rejects a hair over the ceiling', () => {
    expect(isAcceptableVideoDuration(305.0001)).toBe(false)
  })

  it('accepts the ceiling exactly, including after float arithmetic', () => {
    expect(isAcceptableVideoDuration(305.0)).toBe(true)
    expect(isAcceptableVideoDuration(300 + 5)).toBe(true)
    // What a millisecond-based client produces: 305000 / 1000.
    expect(isAcceptableVideoDuration(305000 / 1000)).toBe(true)
  })

  // A duration that could not be read must not sail through as "0 is under the limit".
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects the unusable value %s', (sec) => {
    expect(isAcceptableVideoDuration(sec)).toBe(false)
  })
})

describe('the old 60-second limit is gone from video code', () => {
  it('no longer appears in the product config', () => {
    const src = read('src/lib/config/product.ts')
    expect(src).not.toMatch(/MAX_VIDEO_DURATION_SEC\s*=\s*60\b/)
    expect(src).not.toMatch(/MAX_VIDEO_DURATION_ACCEPT_SEC\s*=\s*62\b/)
  })

  it('no longer appears in the iOS upload limits', () => {
    const src = read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')
    expect(src).not.toMatch(/maxVideoDurationSec\s*=\s*60\b/)
    expect(src).not.toMatch(/maxVideoDurationAcceptSec\s*=\s*62\b/)
  })
})

describe('iOS pins the same two numbers', () => {
  const ios = () => read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')

  it('advertises 300 and accepts 305', () => {
    expect(ios()).toMatch(/maxVideoDurationSec\s*=\s*300\b/)
    expect(ios()).toMatch(/maxVideoDurationAcceptSec\s*=\s*305\b/)
  })

  it('validates through the shared rule, not an inline comparison', () => {
    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).toContain('UploadLimits.isAcceptableVideoDuration')
    // Comparing against the advertised 300 would reject the tolerance band the rule exists for.
    expect(vm).not.toContain('maxVideoDurationSec)')
  })

  it('states the limit in minutes in the picker, with no hardcoded Vietnamese', () => {
    const view = read('ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift')
    expect(view).not.toContain('tối đa 60s')
    expect(view).not.toMatch(/60s/)
    expect(view).toContain('review.video.limitHint')
  })

  it('no longer hardcodes the Vietnamese error', () => {
    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).not.toContain('Video tối đa')
    expect(vm).not.toContain('giây"')
  })

  it('localizes the video errors through the string catalog', () => {
    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).toContain('review.video.tooLong')
  })
})

describe('Android has no video upload path to keep in sync', () => {
  // Android plays review videos but cannot create one: every media picker it has is ImageOnly, and
  // nothing calls /api/upload/video. So there is no 60-second limit there to raise — and this guard
  // is what makes that a checked fact rather than a claim. If someone adds a video picker later,
  // this fails and they have to wire the shared limit at the same time.
  const androidSources = () => {
    const { globSync } = require('tinyglobby') as typeof import('tinyglobby')
    return globSync(['android/app/src/main/**/*.kt'], { cwd: root })
  }

  it('finds Android sources, so the guard is not vacuous', () => {
    expect(androidSources().length).toBeGreaterThan(50)
  })

  it('picks images only, and never uploads video', () => {
    const offenders = androidSources().filter((f) => {
      const src = read(f)
      return /PickVisualMedia\.(VideoOnly|ImageAndVideo)/.test(src) || /upload\/video/.test(src)
    })
    expect(offenders).toEqual([])
  })
})

describe('the backend is authoritative about what it stores', () => {
  it('rejects a submitted duration past the ceiling', () => {
    const route = read('src/app/api/reviews/route.ts')
    expect(route).toContain('isAcceptableVideoDuration')
  })
})

describe('EN and VI both describe the limit in minutes', () => {
  const dict = () => read('src/lib/i18n/w2/reviewNew.ts')

  it.each(['reviewNew.videoTooLong', 'reviewNew.videoLimitHint'])('%s exists in both languages', (key) => {
    const occurrences = dict().split(`'${key}'`).length - 1
    expect(occurrences).toBe(2)
  })

  it('says five minutes, not three hundred seconds', () => {
    expect(dict()).toContain('5 minutes')
    expect(dict()).toContain('5 phút')
    expect(dict()).not.toContain('300 seconds')
    expect(dict()).not.toContain('300 giây')
  })

  it('names the tolerance only in the failure message', () => {
    expect(dict()).toContain('5 minutes 5 seconds')
    expect(dict()).toContain('5 phút 5 giây')
  })
})

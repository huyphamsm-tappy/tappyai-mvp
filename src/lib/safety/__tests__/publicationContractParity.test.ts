import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// ── V2-UAT-003 — the publication contract, on all three clients ──────────────
//
// OWNER DECISION, 2026-08-20. Content Safety stays enabled and fail-closed on Web, Android and
// iOS. Poster-frame examination is NOT accepted as full video examination, because a poster frame
// cannot establish that later frames or the audio are safe. So:
//
//     safe photo/text                    → PUBLISHED
//     unsafe, or not sufficiently examined → RESTRICTED
//     video (never fully examinable here) → RESTRICTED, never PUBLISHED
//     restricted content stays in the author's own profile, with the notice
//     video never bypasses the gate
//
// Full server-side frame and audio examination is a FUTURE capability, deliberately not built
// here — no new paid infrastructure and no async pipeline without explicit approval.
//
// The first half of this file proves the engine behaves that way. The second half proves the
// clients do, because the defect that made 003 worth a P1 was not in the engine at all: the
// engine held the post correctly, and then Android and iOS both read only `ok: true` and told the
// author "Đã đăng bài". The post existed, was not public, and nothing anywhere said so.
//
// Static source assertions for the native halves, because CI runs neither Gradle nor a Swift
// toolchain. Android's behaviour is additionally covered by a real unit test
// (ModerationContractTest); iOS has no toolchain at all, so source is the only gate that exists.

vi.mock('@/lib/ai/llm', () => ({
  AI: {
    vision: vi.fn(async () => ({
      text: 'TEXT: NONE\nSUBJECTS: bowl of noodles, table, chopsticks',
    })),
  },
}))

const NOW = '2026-08-20T00:00:00.000Z'

const HARMLESS = {
  body: 'Bún bò ngon quá',
  hashtags: ['food'],
}

async function evaluate(subject: Record<string, unknown>) {
  const { gatherEvidence } = await import('../evidence/pipeline')
  const { evaluateSafety } = await import('../gate/safetyResult')
  const bundle = await gatherEvidence(subject as never, NOW)
  return evaluateSafety(bundle, NOW)
}

describe('the engine publishes what it examined and holds what it could not', () => {
  it('a harmless photo publishes', () => {
    // The half that has to keep working. A gate that holds everything is not fail-closed, it is
    // broken, and it would take Explore down with it.
    return evaluate({
      ...HARMLESS,
      id: 'p1',
      content_type: 'photo',
      media_url: 'https://storage.example.com/photos/a.jpg',
      thumbnail: 'https://storage.example.com/photos/a.jpg',
    }).then(result => {
      expect(result.publication).toBe('PUBLISHED')
    })
  })

  it('the identical content as a video does NOT publish', async () => {
    // Same caption, same subjects, same poster frame — and it is held, because VIDEO_FRAMES and
    // AUDIO_SPEECH are UNAVAILABLE, so most of the clip was never seen and none of it was heard.
    // This is the owner's decision made executable: a poster frame is not a video examination.
    const result = await evaluate({
      ...HARMLESS,
      id: 'v1',
      content_type: 'video',
      media_url: 'https://storage.example.com/clips/a.mp4',
      thumbnail: 'https://storage.example.com/clips/a.jpg',
    })
    expect(result.publication).toBe('RESTRICTED')
    expect(result.publication).not.toBe('PUBLISHED')
  })

  it('a client that declares "photo" while uploading a video does not get it published', async () => {
    // `content_type` is CLIENT-SUPPLIED. The derived media kind decides, so lying about it buys
    // nothing — otherwise "declare photo, upload .mp4" would publish a clip on one poster frame.
    const result = await evaluate({
      ...HARMLESS,
      id: 'v2',
      content_type: 'photo',
      media_url: 'https://storage.example.com/clips/b.mp4',
      thumbnail: 'https://storage.example.com/clips/b.jpg',
    })
    expect(result.publication).toBe('RESTRICTED')
  })

  it('an unrecognisable media kind does not publish either', async () => {
    const result = await evaluate({
      ...HARMLESS,
      id: 'v3',
      content_type: 'photo',
      media_url: 'https://storage.example.com/blob/c',
      thumbnail: 'https://storage.example.com/blob/c',
    })
    expect(result.publication).toBe('RESTRICTED')
  })

  it('the publication decision is derived, never accepted from the caller', async () => {
    // A client submitting `publication_state: PUBLISHED` must change nothing. `SafetySubject` has
    // no such field, so this is structural rather than filtered — but it is worth an assertion,
    // because a future "just pass the row through" refactor would quietly open it.
    const result = await evaluate({
      ...HARMLESS,
      id: 'v4',
      content_type: 'video',
      media_url: 'https://storage.example.com/clips/d.mp4',
      thumbnail: 'https://storage.example.com/clips/d.jpg',
      publication_state: 'PUBLISHED',
      safety_state: 'SAFE',
    })
    expect(result.publication).toBe('RESTRICTED')
  })
})

describe('a failed evaluation never publishes', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.doUnmock('@/lib/ai/llm'))

  it('the vision provider failing holds the post', async () => {
    vi.doMock('@/lib/ai/llm', () => ({
      AI: { vision: vi.fn(async () => { throw new Error('provider down') }) },
    }))
    const { gatherEvidence } = await import('../evidence/pipeline')
    const { evaluateSafety } = await import('../gate/safetyResult')
    const bundle = await gatherEvidence(
      {
        ...HARMLESS,
        id: 'p2',
        content_type: 'photo',
        media_url: 'https://storage.example.com/photos/e.jpg',
        thumbnail: 'https://storage.example.com/photos/e.jpg',
      } as never,
      NOW,
    )
    const result = evaluateSafety(bundle, NOW)
    // Provider failure is not evidence of safety. It is not evidence of anything.
    expect(result.publication).toBe('RESTRICTED')
  })
})

describe('the author is told, in their own language', () => {
  it('both languages are carried on the record, not looked up', async () => {
    // A dictionary miss would leave an author with a blank screen and no idea why their post is
    // not visible, so the notice carries both languages rather than resolving one.
    const { NOTICE_FOR } = await import('../gate/authorNotice')
    for (const [state, notice] of Object.entries(NOTICE_FOR)) {
      if (!notice.notify) continue
      expect(`${state} vi title`).toBeTruthy()
      expect(notice.title.length).toBeGreaterThan(0)
      expect(notice.detail.length).toBeGreaterThan(0)
      expect(notice.title_en.length).toBeGreaterThan(0)
      expect(notice.detail_en.length).toBeGreaterThan(0)
      // And they must actually be different languages, not the same string twice.
      expect(notice.detail_en).not.toBe(notice.detail)
    }
  })

  it('only a real violation is worded as one, in both languages', async () => {
    const { NOTICE_FOR, noticeIsTruthful } = await import('../gate/authorNotice')
    for (const state of Object.keys(NOTICE_FOR)) {
      expect(noticeIsTruthful(state as never)).toBe(true)
    }
    // The four ways of not knowing must each say so explicitly, in both languages. An author
    // whose upload could not be verified has not been accused of anything.
    for (const state of ['UNDETERMINED', 'HUMAN_REVIEW_REQUIRED', 'LEGAL_REVIEW_REQUIRED', 'ENGINE_ERROR']) {
      const notice = NOTICE_FOR[state as never] as { detail: string; detail_en: string }
      expect(notice.detail).toContain('không phải là kết luận vi phạm')
      expect(notice.detail_en).toContain('not a finding that you did anything wrong')
    }
  })

  it('the notice never leaks which check held the post', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice')
    const payload = authorModerationPayload(
      { publication_state: 'RESTRICTED', safety_state: 'UNDETERMINED' },
      'en',
    )
    expect(payload).not.toBeNull()
    expect(Object.keys(payload!).sort()).toEqual(
      ['assertsViolation', 'detail', 'state', 'title'].sort(),
    )
    const serialised = JSON.stringify(payload)
    for (const leak of ['UNDETERMINED', 'ts.', 'policy', 'evidence', 'IMAGE_FRAME', 'VIDEO_FRAMES']) {
      expect(serialised).not.toContain(leak)
    }
  })

  it('an inactive gate says nothing at all', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice')
    expect(authorModerationPayload({}, 'vi')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Client parity
// ---------------------------------------------------------------------------

const read = (path: string) => readFileSync(path, 'utf8')

describe('no client reports a held post as posted', () => {
  it('web: the composer renders the server outcome instead of success', () => {
    const source = read('src/app/reviews/new/page.tsx')
    expect(source).toMatch(/data\.moderation\?\.state === 'RESTRICTED'/)
    // And it returns before the success path — otherwise both would run.
    expect(source).toMatch(/data\.moderation\?\.state === 'RESTRICTED'\)\s*\{[\s\S]{0,120}return/)
  })

  it('android: the composer has a third outcome, and it is not a toast', () => {
    const vm = read(
      'android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewComposerViewModel.kt',
    )
    // The repository returns the gate's outcome rather than Unit — discarding it is what made
    // the composer announce success for a held post.
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/data/ReviewsRepository.kt'))
      .toContain('NetworkResult<ReviewModeration?>')
    expect(vm).toContain('data class Held')
    expect(vm).toMatch(/!moderation\.state\.isPublished/)

    const screen = read('android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt')
    expect(screen).toContain('is ComposerEvent.Held ->')
    // A dialog, not a Toast: the one moment the author is told, and a Toast is dismissed by
    // looking away.
    expect(screen).toMatch(/heldNotice\?\.let[\s\S]{0,400}TappyDialog/)
  })

  it('ios: the moderation screen is checked before the success screen', () => {
    const view = read('ios/TappyAI/Features/Reviews/UI/CreateReviewView.swift')
    // Order is the whole assertion. If `vm.success` were tested first, a held post would show
    // the checkmark and auto-dismiss before the notice could ever render.
    const moderationAt = view.indexOf('vm.moderationNotice')
    const successAt = view.indexOf('vm.success')
    expect(moderationAt).toBeGreaterThan(-1)
    expect(successAt).toBeGreaterThan(-1)
    expect(moderationAt).toBeLessThan(successAt)

    const vm = read('ios/TappyAI/Features/Reviews/UI/CreateReviewViewModel.swift')
    expect(vm).toMatch(/!moderation\.state\.isPublished/)
    expect(vm).toContain('self.moderationNotice = moderation')
  })

  it('every client fails closed on a lifecycle state it does not recognise', () => {
    // Full video examination is a future capability, so the backend may add a state these builds
    // have never heard of. None of them may read it as published.
    expect(read('android/app/src/main/java/com/tappyai/app/reviews/data/Review.kt'))
      .toMatch(/else -> Unknown/)
    expect(read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift'))
      .toMatch(/ReviewPublicationState\(rawValue: raw\) \?\? \.unknown/)
  })

  it('no client re-words the notice locally', () => {
    // The wording must describe the row that was stored. A client-side code-to-string map is a
    // second opinion that will eventually disagree with the server, and the author would have no
    // way to tell which one was true.
    const android = read('android/app/src/main/java/com/tappyai/app/reviews/data/Review.kt')
    expect(android).toContain('SERVER TEXT')
    const ios = read('ios/TappyAI/Features/Reviews/Model/CreateReviewModels.swift')
    expect(ios).toContain('SERVER TEXT')
  })
})

describe('the author can find out why, after the composer is gone', () => {
  it('the self-scoped route attaches the notice and strips the internals', () => {
    const source = read('src/app/api/reviews/mine/route.ts')
    expect(source).toContain('authorModerationPayload')
    // Selected so the notice can be derived...
    expect(source).toContain('publication_state, safety_state')
    // ...and destructured away so neither reaches the client.
    expect(source).toMatch(/const \{ publication_state, safety_state, \.\.\.rest \}/)
  })

  it('android shows it on the post itself, not only at upload time', () => {
    const screen = read('android/app/src/main/java/com/tappyai/app/myreviews/MyReviewsScreen.kt')
    expect(screen).toContain('R.string.reviews_moderation_not_public')
    expect(screen).toMatch(/review\.moderation\?\.let/)
  })

  it('android keeps the platform hold distinct from the author hiding their own post', () => {
    // Hiding is the author's reversible choice; this is not. Presenting one as the other would
    // tell someone their post is hidden by their own hand when it is not.
    const model = read('android/app/src/main/java/com/tappyai/app/myreviews/Review.kt')
    expect(model).toMatch(/NOT the same thing as \[isHidden\]/)
    const screen = read('android/app/src/main/java/com/tappyai/app/myreviews/MyReviewsScreen.kt')
    expect(screen).toContain('if (review.isHidden)')
    expect(screen).toContain('if (review.moderation != null)')
  })
})

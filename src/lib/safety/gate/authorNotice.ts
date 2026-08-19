/**
 * What the author is truthfully told — as text, not as a delivery mechanism.
 *
 * 🚨 THIS SENDS NOTHING. No notification system, no e-mail, no push, no row. It
 * derives the honest wording for each state so that when a delivery channel is
 * approved, the message it carries is already the true one rather than something
 * improvised at the last minute.
 *
 * ============================================================================
 * THE RULE
 * ============================================================================
 * A notice may only say what actually happened. In particular:
 *
 *   · `UNDETERMINED` / `ENGINE_ERROR` are NOT violations, and the author must
 *     never be told, implied, or allowed to infer that they did something wrong.
 *     The system did not reach a conclusion — that is a fact about the system.
 *   · `RESTRICTED` here means the post was never published. It is not a takedown
 *     and must not be described as one.
 *
 * 🔴 RELEASE BLOCKER, RECORDED NOT SOLVED: Group 01 `GA-8` requires an adverse
 * action to carry notice **and an appeal path**, and `AP-3`/`AP-5` require the
 * appeal to be decided by someone other than whoever decided originally — which
 * `OWN-2` makes impossible while one person holds every role. No appeal exists.
 * So the `VIOLATION` notice below is written and testable, but enabling an
 * adverse action in production remains blocked on governance, not on code.
 */

import type { SafetyState } from './safetyResult';

export interface AuthorNotice {
  /** Whether the author should be told anything at all. */
  readonly notify: boolean;
  /**
   * True only where the system actually concluded a violation. Never true for
   * uncertainty, and a test asserts that exhaustively.
   */
  readonly assertsViolation: boolean;
  /** Vietnamese — the product's first language and this record's default. */
  readonly title: string;
  readonly detail: string;
  /**
   * English. Both languages are carried in the same record rather than resolved
   * from a dictionary, because a safety notice must not be able to go missing:
   * a lookup that returns undefined would leave the author with an empty screen
   * and no idea why their post is not visible.
   */
  readonly title_en: string;
  readonly detail_en: string;
}

/** What the author sees, in one language, once a caller has chosen it. */
export interface ResolvedNotice {
  readonly notify: boolean;
  readonly assertsViolation: boolean;
  readonly title: string;
  readonly detail: string;
}

const SILENT: AuthorNotice = {
  notify: false,
  assertsViolation: false,
  title: '',
  detail: '',
  title_en: '',
  detail_en: '',
};

/**
 * The notice for each state, written out state by state so a change is visible.
 *
 * Vietnamese, because the product is Vietnamese and a safety message the author
 * cannot read is not a notice.
 */
export const NOTICE_FOR: Readonly<Record<SafetyState, AuthorNotice>> = Object.freeze({
  SAFE: SILENT,

  VIOLATION: {
    notify: true,
    assertsViolation: true,
    title: 'Bài của bạn chưa được đăng',
    detail:
      'Nội dung này vi phạm chính sách an toàn của TappyAI nên chưa được đăng. Bài vẫn thuộc về bạn và không bị xoá.',
    title_en: 'Your post was not published',
    detail_en:
      'This content goes against TappyAI’s safety policy, so it was not published. The post is still yours and has not been deleted.',
  },

  // The three ways of not knowing share one honest message: the system has not
  // finished, and that is not an accusation.
  UNDETERMINED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Hệ thống chưa đủ căn cứ để kết luận, nên bài đang chờ kiểm tra. Đây không phải là kết luận vi phạm.',
    title_en: 'Your post is being checked',
    detail_en:
      'The system did not have enough to reach a conclusion, so your post is waiting to be checked. This is not a finding that you did anything wrong.',
  },
  HUMAN_REVIEW_REQUIRED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Nội dung này cần người thật xem trước khi đăng. Đây không phải là kết luận vi phạm.',
    title_en: 'Your post is being checked',
    detail_en:
      'This content needs a person to look at it before it can be published. This is not a finding that you did anything wrong.',
  },
  LEGAL_REVIEW_REQUIRED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Bài đang chờ kiểm tra trước khi đăng. Đây không phải là kết luận vi phạm.',
    title_en: 'Your post is being checked',
    detail_en:
      'Your post is waiting to be checked before it is published. This is not a finding that you did anything wrong.',
  },
  ENGINE_ERROR: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Hệ thống chưa kiểm tra xong nội dung này. Đây không phải là kết luận vi phạm.',
    title_en: 'Your post is being checked',
    detail_en:
      'The system has not finished checking this content. This is not a finding that you did anything wrong.',
  },
});

/**
 * The notice in one language.
 *
 * Vietnamese is the default and unqualified `title`/`detail` stay Vietnamese, so
 * every existing caller and contract keeps the meaning it already had. Anything
 * that is not exactly `'en'` resolves to Vietnamese rather than to nothing — an
 * unrecognised locale must degrade to a real message, never to a blank one.
 */
export function noticeFor(state: SafetyState, lang = 'vi'): ResolvedNotice {
  const n = NOTICE_FOR[state];
  const english = lang === 'en';
  return {
    notify: n.notify,
    assertsViolation: n.assertsViolation,
    title: english ? n.title_en : n.title,
    detail: english ? n.detail_en : n.detail,
  };
}

/**
 * The one invariant worth asserting on its own: only a real violation may carry
 * a violation claim.
 */
export function noticeIsTruthful(state: SafetyState): boolean {
  return NOTICE_FOR[state].assertsViolation === (state === 'VIOLATION');
}

// ---------------------------------------------------------------------------
// What the author's own client is told
// ---------------------------------------------------------------------------

/** The author-facing shape. Deliberately small — see the comment on the builder. */
export interface AuthorModerationPayload {
  /** The post's visibility, which the author is entitled to know about their own post. */
  readonly state: 'UNDER_REVIEW' | 'PUBLISHED' | 'RESTRICTED';
  readonly title: string;
  readonly detail: string;
  /** Lets a client style a hold differently from a refusal without parsing prose. */
  readonly assertsViolation: boolean;
}

/**
 * Turn the lifecycle columns into something the author's own client can show.
 *
 * 🔑 Returns `null` when the gate wrote no columns. That is the inactive-gate
 * case, and it must stay indistinguishable from the world before the gate
 * existed — a response that suddenly grew a `moderation` key would be a
 * behaviour change made by a feature that is switched off.
 *
 * 🚨 WHAT IS DELIBERATELY NOT HERE: `safety_state`, policy identities, evidence,
 * modality coverage, and the evaluated version. Those explain WHICH check held
 * the post, and an author who learns that learns what to change to get past it.
 * The author is owed the honest fact that the post is held and that it is not an
 * accusation — not the internals of how it was decided. This is the same
 * boundary the feed already enforces; it is restated here because this is the
 * one response that legitimately speaks to the author about their own post.
 */
export function authorModerationPayload(
  columns: { publication_state?: string; safety_state?: string },
  lang = 'vi',
): AuthorModerationPayload | null {
  const state = columns.publication_state;
  if (state !== 'UNDER_REVIEW' && state !== 'PUBLISHED' && state !== 'RESTRICTED') return null;

  // The wording comes from the safety state when there is one. An unrecognised
  // or absent safety state falls back to the most conservative honest message —
  // "we have not finished" — never to silence and never to an accusation.
  const safety = (columns.safety_state ?? '') as SafetyState;
  const known = safety in NOTICE_FOR ? safety : 'ENGINE_ERROR';
  const notice = noticeFor(known, lang);

  return {
    state,
    title: notice.title,
    detail: notice.detail,
    assertsViolation: notice.assertsViolation,
  };
}

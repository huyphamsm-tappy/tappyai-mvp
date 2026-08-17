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
  readonly title: string;
  readonly detail: string;
}

const SILENT: AuthorNotice = {
  notify: false,
  assertsViolation: false,
  title: '',
  detail: '',
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
  },

  // The three ways of not knowing share one honest message: the system has not
  // finished, and that is not an accusation.
  UNDETERMINED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Hệ thống chưa đủ căn cứ để kết luận, nên bài đang chờ kiểm tra. Đây không phải là kết luận vi phạm.',
  },
  HUMAN_REVIEW_REQUIRED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Nội dung này cần người thật xem trước khi đăng. Đây không phải là kết luận vi phạm.',
  },
  LEGAL_REVIEW_REQUIRED: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Bài đang chờ kiểm tra trước khi đăng. Đây không phải là kết luận vi phạm.',
  },
  ENGINE_ERROR: {
    notify: true,
    assertsViolation: false,
    title: 'Bài của bạn đang được kiểm tra',
    detail:
      'Hệ thống chưa kiểm tra xong nội dung này. Đây không phải là kết luận vi phạm.',
  },
});

export function noticeFor(state: SafetyState): AuthorNotice {
  return NOTICE_FOR[state];
}

/**
 * The one invariant worth asserting on its own: only a real violation may carry
 * a violation claim.
 */
export function noticeIsTruthful(state: SafetyState): boolean {
  return NOTICE_FOR[state].assertsViolation === (state === 'VIOLATION');
}

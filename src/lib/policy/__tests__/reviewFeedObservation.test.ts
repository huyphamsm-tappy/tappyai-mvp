/**
 * The wired surface: `reviews` row → P1 observation.
 *
 * This is the only policy code the production Explore route reaches, so the
 * guarantees that matter here are the ones a live feed depends on:
 *
 *   · it never throws, whatever the row looks like;
 *   · it never carries content, media or identity into an observation record;
 *   · it never produces a violation from absent consent evidence;
 *   · it produces no action vocabulary of any kind;
 *   · a classification belongs to a content fingerprint, so an edit invalidates
 *     it instead of outliving it.
 */

import { describe, expect, it } from 'vitest';

import { contentVersionFrom } from '../explore/contentClassification';
import {
  observePrivacyForFeed,
  observePrivacyForReview,
  type ReviewRowForObservation,
} from '../explore/reviewFeedObservation';
import { P1_POLICY_REF } from '../detect/privacyPersonalInformation';

const T = '2026-08-17T00:00:00Z';

/** A review of a place, quoting the place's own phone number — §9.4 carve-out. */
const BUSINESS_ROW: ReviewRowForObservation = {
  id: 'review-business',
  body: 'Quán ngon, đặt bàn 0912 345 678',
  hashtags: ['anuong', 'saigon'],
  place_name: 'Quán Ngon',
  place_address: '12 Lê Lợi, Q1 — 0912345678',
};

/** Someone else's contact details, with nothing establishing consent. */
const UNKNOWN_ROW: ReviewRowForObservation = {
  id: 'review-unknown',
  body: 'Số của chị ấy là 0987 654 321 nhé',
  hashtags: [],
  place_name: 'Quán Ngon',
  place_address: '12 Lê Lợi, Q1',
};

/** Ordinary content with no contact information at all. */
const PLAIN_ROW: ReviewRowForObservation = {
  id: 'review-plain',
  body: 'Phở ở đây ngon, nước dùng đậm đà',
  hashtags: ['pho'],
  place_name: 'Phở Hà',
  place_address: '5 Nguyễn Huệ',
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('classification of feed rows', () => {
  it("a business's own number in a review of that business is not governed", () => {
    const [record] = observePrivacyForReview(BUSINESS_ROW, T);
    expect(record.state).toBe('PRESENTABLE');
    expect(record.policy).toBe(P1_POLICY_REF);
    expect(record.presentationConditions).toBe(false);
  });

  it('another person\'s contact details with no consent evidence stay UNDETERMINED', () => {
    const [record] = observePrivacyForReview(UNKNOWN_ROW, T);
    expect(record.state).toBe('UNDETERMINED_EVIDENCE');
  });

  it('ordinary content is UNDETERMINED, not cleared — absence of a pattern proves nothing', () => {
    const [record] = observePrivacyForReview(PLAIN_ROW, T);
    expect(record.state).toBe('UNDETERMINED_EVIDENCE');
  });

  it('no row in a page can ever be constituted today (freeze clause 3)', () => {
    const records = observePrivacyForFeed([BUSINESS_ROW, UNKNOWN_ROW, PLAIN_ROW], T);
    expect(records).toHaveLength(3);
    for (const r of records) expect(r.state).not.toBe('POLICY_CONSTITUTED');
  });
});

// ---------------------------------------------------------------------------
// Privacy of the observation itself
// ---------------------------------------------------------------------------

describe('an observation record carries no content and no identity', () => {
  it('has exactly the metadata fields the contract allows', () => {
    const [record] = observePrivacyForReview(UNKNOWN_ROW, T);
    expect(Object.keys(record).sort()).toEqual([
      'contentId',
      'contentVersion',
      'evaluatedAt',
      'policy',
      'presentationConditions',
      'state',
    ]);
  });

  it('leaks no field value from the row it classified', () => {
    const row = { ...UNKNOWN_ROW, user_id: 'user-42', media_url: 'https://x/y.mp4' };
    const serialised = JSON.stringify(observePrivacyForReview(row, T));
    for (const secret of ['0987', '654321', 'chị ấy', 'user-42', 'y.mp4', 'Lê Lợi', 'Quán Ngon'])
      expect(serialised, secret).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------
// Staleness — a classification belongs to a version of the content
// ---------------------------------------------------------------------------

describe('content fingerprint', () => {
  it('is derived from the classified fields only', () => {
    const [record] = observePrivacyForReview(BUSINESS_ROW, T);
    expect(record.contentVersion).toBe(
      contentVersionFrom({ body: BUSINESS_ROW.body, hashtags: 'anuong saigon' }),
    );
  });

  it('changes when the classified text changes', () => {
    const edited = { ...BUSINESS_ROW, body: 'Quán ngon, đặt bàn 0912 345 679' };
    expect(observePrivacyForReview(edited, T)[0].contentVersion).not.toBe(
      observePrivacyForReview(BUSINESS_ROW, T)[0].contentVersion,
    );
  });

  it('does not churn on engagement — counters are not classified fields', () => {
    const busy = { ...BUSINESS_ROW, like_count: 900, view_count: 12345 };
    expect(observePrivacyForReview(busy, T)[0].contentVersion).toBe(
      observePrivacyForReview(BUSINESS_ROW, T)[0].contentVersion,
    );
  });
});

// ---------------------------------------------------------------------------
// Failure modes a live feed will actually hit
// ---------------------------------------------------------------------------

describe('the feed can never break because of this', () => {
  const HOSTILE: unknown[] = [
    null,
    undefined,
    {},
    { id: '' },
    { id: 42 },
    { id: 'x', body: null, hashtags: null },
    { id: 'x', body: 12345, hashtags: 'notanarray' },
    { id: 'x', body: {}, hashtags: [{ nested: true }] },
    { id: 'x', body: 'a'.repeat(50_000) },
    { id: 'x', place_name: null, place_address: undefined },
  ];

  it('survives every malformed row shape without throwing', () => {
    expect(() =>
      observePrivacyForFeed(HOSTILE as ReviewRowForObservation[], T),
    ).not.toThrow();
  });

  it('skips rows with no usable id rather than inventing one', () => {
    expect(observePrivacyForReview({ body: 'gọi 0912 345 678' }, T)).toEqual([]);
    expect(observePrivacyForReview({ id: '', body: 'x' }, T)).toEqual([]);
    expect(observePrivacyForReview({ id: 42 } as ReviewRowForObservation, T)).toEqual([]);
  });

  it('an empty page is an empty observation, not an error', () => {
    expect(observePrivacyForFeed([], T)).toEqual([]);
  });

  it('never yields a violation from any of those rows', () => {
    for (const r of observePrivacyForFeed(HOSTILE as ReviewRowForObservation[], T))
      expect(r.state).not.toBe('POLICY_CONSTITUTED');
  });
});

// ---------------------------------------------------------------------------
// No action vocabulary
// ---------------------------------------------------------------------------

describe('classification is not action', () => {
  it('produces no field that could change what a user sees', () => {
    const records = observePrivacyForFeed([BUSINESS_ROW, UNKNOWN_ROW, PLAIN_ROW], T);
    for (const record of records)
      for (const forbidden of [
        'action',
        'severity',
        'rank',
        'score',
        'hide',
        'visible',
        'suppress',
        'order',
        'position',
        'notify',
      ])
        expect(Object.keys(record), forbidden).not.toContain(forbidden);
  });

  it('the order of the observation follows the order of the rows, and changes nothing', () => {
    const rows = [PLAIN_ROW, BUSINESS_ROW, UNKNOWN_ROW];
    expect(observePrivacyForFeed(rows, T).map((r) => r.contentId)).toEqual(
      rows.map((r) => r.id),
    );
  });
});

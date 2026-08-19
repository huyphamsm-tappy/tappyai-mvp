/**
 * The absence-of-engagement model.
 *
 * The claim under test is narrow and load-bearing: a policy may be reported
 * ABSENT only when the item was completely examined and nothing observed raises
 * it. Everything else — a failure, a partial examination, any indicator — keeps
 * the old answer, which is held.
 *
 * The most important assertions here are the ones that prove this module cannot
 * make the system less safe: it never emits `true`, it never fires on an
 * incomplete or failed examination, and topic alone never blocks.
 */

import { describe, expect, it } from 'vitest';

import { gatherEvidence } from '../evidence/pipeline';
import { evaluateSafety, publicationFromGate } from '../gate/safetyResult';
import { aggregateWithRules } from '../gate/publicationGate';
import {
  ABSENCE_CAPABLE_POLICIES,
  POLICY_INDICATORS,
  absenceSignalFor,
  examinationOf,
  indicatorsPresentFor,
  observableSurface,
} from '../mapping/applicability';
import { signalsFor } from '../mapping/policySignals';

const T = '2026-08-19T00:00:00.000Z';

/**
 * The two RESTRICTED-disposition policies, restated as an explicit override.
 *
 * This now MATCHES production — the Owner approved the change on 2026-08-19 and
 * `PUBLICATION_GATE_RULES` carries it. It is kept as an explicit override anyway
 * so `heldBy` in these tests reports only PROHIBITED policies, which is the
 * interesting question: what would still hold this post if the RESTRICTED pair
 * were not part of the picture at all. A test below asserts the production rules
 * really do agree, so the two can never silently diverge.
 */
const RESTRICTED_OFF = {
  'ts.graphic.presentation': 'DOES_NOT_BLOCK_PUBLICATION',
  'ts.sexual.adult-content': 'DOES_NOT_BLOCK_PUBLICATION',
} as const;

const post = (over: Record<string, unknown> = {}) => ({
  id: 'x',
  body: 'Quán này ngon, không gian thoáng',
  hashtags: ['anuong'],
  place_name: 'Quán Ngon',
  place_address: '12 Lê Lợi',
  content_type: 'photo',
  source_type: 'upload',
  ...over,
});

async function outcomeOf(subject: Record<string, unknown>) {
  const bundle = await gatherEvidence(subject as never, T);
  const result = evaluateSafety(bundle, T);
  const alt = aggregateWithRules(result.policies, RESTRICTED_OFF);
  return {
    bundle,
    result,
    today: result.publication,
    // Through the same MVP resolution the real decision uses, so this column and
    // `today` are comparable. `storedStateFor` alone is the gate's own vocabulary
    // and still says UNDER_REVIEW; publication is what the row actually gets.
    ifRestrictedOff: publicationFromGate(result.state, alt.decision),
    heldBy: alt.blockedBy,
  };
}

// ---------------------------------------------------------------------------
// Examination completeness
// ---------------------------------------------------------------------------

describe('examination completeness', () => {
  it('a text-only post is completely examined', async () => {
    const { bundle } = await outcomeOf(post());
    expect(examinationOf(bundle).level).toBe('COMPLETE');
  });

  it('a video is never completely examined in this build', async () => {
    const { bundle } = await outcomeOf(post({ content_type: 'video', media_url: 'https://x/v.mp4' }));
    expect(examinationOf(bundle).level).toBe('INCOMPLETE');
    expect(examinationOf(bundle).reason).toMatch(/audio|frames/i);
  });

  it('media that could not be read is INCOMPLETE, never COMPLETE', async () => {
    // A photo whose frame reference is not fetchable: there was something to
    // look at and we did not see it.
    const { bundle } = await outcomeOf(post({ content_type: 'photo', media_url: 'file:///x.jpg' }));
    expect(examinationOf(bundle).level).toBe('INCOMPLETE');
  });

  it('a failed modality is FAILED, and FAILED is not INCOMPLETE', async () => {
    const bundle = {
      contentId: 'x',
      contentVersion: 'v1',
      gatheredAt: T,
      results: [
        { modality: 'TEXT', status: 'OBSERVED', contactIdentifiers: [], recognisedText: '' },
        { modality: 'METADATA', status: 'FAILED', reason: 'boom' },
      ],
    } as never;
    expect(examinationOf(bundle).level).toBe('FAILED');
  });
});

// ---------------------------------------------------------------------------
// The safety asymmetry
// ---------------------------------------------------------------------------

describe('the absence model can only ever be more cautious', () => {
  it('never emits a true signal for any policy', async () => {
    const { bundle } = await outcomeOf(post());
    for (const p of ABSENCE_CAPABLE_POLICIES)
      for (const v of Object.values(absenceSignalFor(p, bundle)))
        expect(v, p).toBe(false);
  });

  it('emits nothing at all when the examination was not complete', async () => {
    const { bundle } = await outcomeOf(post({ content_type: 'video', media_url: 'https://x/v.mp4' }));
    for (const p of ABSENCE_CAPABLE_POLICIES) expect(absenceSignalFor(p, bundle), p).toEqual({});
  });

  it('emits nothing for a policy whose indicators are present', async () => {
    const { bundle } = await outcomeOf(post({ body: 'Tao sẽ giết mày' }));
    expect(absenceSignalFor('ts.violence.incitement-threats', bundle)).toEqual({});
  });

  it('an undeclared policy is never asserted absent', async () => {
    const { bundle } = await outcomeOf(post());
    expect(absenceSignalFor('ts.hate.protected-target-abuse', bundle)).toEqual({});
    expect(signalsFor('ts.hate.protected-target-abuse', bundle)).toEqual({});
  });

  it('the caption is part of the observable surface — a written threat is visible', async () => {
    const { bundle } = await outcomeOf(post({ body: 'Tao sẽ giết mày' }));
    expect(observableSurface(bundle)).toContain('giết');
  });
});

// ---------------------------------------------------------------------------
// Topic is not harm — §7 of the brief, and the thing most likely to regress
// ---------------------------------------------------------------------------

describe('topic alone never holds a post', () => {
  const topics: Record<string, string> = {
    'political criticism': 'Tôi không đồng ý với chính sách mới của chính phủ về thuế',
    'political news': 'Kết quả bầu cử đã được công bố hôm nay',
    'religious teaching': 'Bài giảng về đạo Phật rất hay',
    'religious comparison': 'So sánh giữa nhà thờ và chùa ở Việt Nam',
    'ordinary criticism': 'Quán này phục vụ chậm, đồ ăn nguội, tôi không hài lòng',
    'travel': 'Biển Nha Trang đẹp quá, nước trong vắt',
    'shopping': 'Mua được đôi giày giảm giá 50% ở đây',
  };

  for (const [name, body] of Object.entries(topics)) {
    it(`${name} is not held by any prohibitive policy`, async () => {
      const { heldBy, ifRestrictedOff } = await outcomeOf(post({ body }));
      expect(heldBy, name).toEqual([]);
      expect(ifRestrictedOff, name).toBe('PUBLISHED');
    });
  }

  it('no indicator list contains a political or religious topic word', () => {
    // The regression that would quietly turn this system into a topic filter.
    const forbidden = ['politic', 'chính trị', 'chinh tri', 'religion', 'tôn giáo', 'ton giao',
      'church', 'nhà thờ', 'mosque', 'temple', 'chùa', 'election', 'bầu cử', 'government',
      'chính phủ', 'protest', 'biểu tình', 'party', 'đảng'];
    for (const entry of POLICY_INDICATORS)
      for (const term of entry.terms)
        for (const bad of forbidden)
          expect(term.toLowerCase(), `${entry.policy}: "${term}"`).not.toContain(bad);
  });
});

// ---------------------------------------------------------------------------
// Harm-shaped content is still held
// ---------------------------------------------------------------------------

describe('content that raises a policy is still held', () => {
  const cases: { name: string; body: string; expectHeldBy: string }[] = [
    { name: 'threat', body: 'Tao sẽ giết mày', expectHeldBy: 'ts.violence.incitement-threats' },
    { name: 'sexual', body: 'clip sex khoả thân', expectHeldBy: 'ts.sexual.exploitation-nonconsent' },
    { name: 'child + sexual', body: 'trẻ em khoả thân', expectHeldBy: 'ts.child.sexual-exploitation' },
    { name: 'self-harm', body: 'hướng dẫn tự tử', expectHeldBy: 'ts.selfharm.promotion' },
    { name: 'scam', body: 'Đầu tư crypto lợi nhuận cam kết 100%', expectHeldBy: 'ts.fraud.scam' },
    { name: 'graphic harm', body: 'máu và vết thương khắp nơi', expectHeldBy: 'ts.violence.graphic-harm' },
    { name: 'harassment', body: 'thằng chủ quán ngu như bò', expectHeldBy: 'ts.harassment.targeted' },
  ];

  for (const c of cases) {
    it(`${c.name} is rejected, and never published`, async () => {
      const { heldBy, ifRestrictedOff, today } = await outcomeOf(post({ body: c.body }));
      expect(heldBy, c.name).toContain(c.expectHeldBy);
      expect(ifRestrictedOff, c.name).toBe('RESTRICTED');
      expect(today, c.name).toBe('RESTRICTED');
    });
  }
});

// ---------------------------------------------------------------------------
// Video, and the failure modes
// ---------------------------------------------------------------------------

describe('unknown never becomes safe', () => {
  it('a video is rejected under EVERY configuration — audio and frames were never seen', async () => {
    const { today, ifRestrictedOff, heldBy } = await outcomeOf(
      post({ content_type: 'video', media_url: 'https://x/v.mp4' }),
    );
    expect(today).toBe('RESTRICTED');
    expect(ifRestrictedOff).toBe('RESTRICTED');
    expect(heldBy.length).toBeGreaterThan(10);
  });

  it('a benign, completely examined post publishes in PRODUCTION configuration', async () => {
    const { today, heldBy } = await outcomeOf(post());
    expect(heldBy).toEqual([]);
    expect(today).toBe('PUBLISHED');
  });

  it('the approved decision is live: exactly the two RESTRICTED policies', async () => {
    const { PUBLICATION_GATE_RULES } = await import('../gate/publicationGate');
    expect(PUBLICATION_GATE_RULES['ts.graphic.presentation']).toBe('DOES_NOT_BLOCK_PUBLICATION');
    expect(PUBLICATION_GATE_RULES['ts.sexual.adult-content']).toBe('DOES_NOT_BLOCK_PUBLICATION');
    // ...and it went no further than that.
    for (const p of [
      'ts.child.sexual-exploitation',
      'ts.child.sexualization',
      'ts.child.grooming',
      'ts.child.abuse-harm',
      'ts.sexual.exploitation-nonconsent',
      'ts.violence.graphic-harm',
      'ts.fraud.scam',
    ])
      expect(PUBLICATION_GATE_RULES[p], p).toBe('BLOCKS_PUBLICATION');
  });

  /** The bypass the completeness rule exists to close. */
  it('a video declared as a photo is still treated as a video', async () => {
    const { today } = await outcomeOf(
      post({ content_type: 'photo', media_url: 'https://storage.googleapis.com/b/clip.mp4' }),
    );
    expect(today).toBe('RESTRICTED');
  });

  it('media of an unrecognisable kind is never treated as fully examined', async () => {
    const { today } = await outcomeOf(
      post({ content_type: 'photo', media_url: 'https://storage.googleapis.com/b/object' }),
    );
    expect(today).toBe('RESTRICTED');
  });
});

describe('indicator matching', () => {
  it('an unknown policy is treated as still-engaged, never as absent', () => {
    expect(indicatorsPresentFor('ts.not.a.real.policy', 'anything')).toBe(true);
  });

  it('matches indicators burned into an image, not only the caption', () => {
    const bundle = {
      contentId: 'x',
      contentVersion: 'v1',
      gatheredAt: T,
      results: [
        { modality: 'TEXT', status: 'OBSERVED', contactIdentifiers: [], recognisedText: 'ngon' },
        {
          modality: 'IMAGE_FRAME',
          status: 'OBSERVED',
          recognisedText: 'ĐẦU TƯ CRYPTO LỢI NHUẬN',
          descriptors: [],
          contactIdentifiers: [],
        },
      ],
    } as never;
    expect(indicatorsPresentFor('ts.fraud.scam', observableSurface(bundle))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The publication lifecycle, end to end through evaluateSafety
// ---------------------------------------------------------------------------

describe('SAFE → PUBLISHED for ordinary content', () => {
  const benign: Record<string, string> = {
    restaurant: 'Quán bún chả ngon, phục vụ nhanh',
    travel: 'Biển Nha Trang đẹp quá, nước trong vắt',
    shopping: 'Mua được đôi giày giảm giá ở đây',
    'ordinary UGC': 'Hôm nay đi chơi với gia đình, vui lắm',
    'negative review': 'Đồ ăn nguội, phục vụ chậm, không hài lòng',
  };

  for (const [name, body] of Object.entries(benign)) {
    it(`${name} publishes`, async () => {
      const { today, heldBy } = await outcomeOf(post({ body }));
      expect(heldBy, name).toEqual([]);
      expect(today, name).toBe('PUBLISHED');
    });
  }
});

describe('harmful variants of protected topics are still held', () => {
  it('violent political content is held, while political criticism is not', async () => {
    const violent = await outcomeOf(post({ body: 'Phải giết hết bọn quan chức đó' }));
    expect(violent.today).toBe('RESTRICTED');
    expect(violent.heldBy).toContain('ts.violence.incitement-threats');

    const ordinary = await outcomeOf(post({ body: 'Tôi phản đối chính sách thuế mới' }));
    expect(ordinary.today).toBe('PUBLISHED');
  });

  it('religious incitement is held, while religious teaching is not', async () => {
    const incite = await outcomeOf(post({ body: 'Giết hết bọn theo đạo đó đi' }));
    expect(incite.today).toBe('RESTRICTED');

    const teaching = await outcomeOf(post({ body: 'Bài giảng về đạo Phật hôm nay rất hay' }));
    expect(teaching.today).toBe('PUBLISHED');
  });
});

describe('the publication boundary refuses everything it cannot stand behind', () => {
  it('a failed modality is never published', async () => {
    const { evaluateSafety: evalSafety } = await import('../gate/safetyResult');
    const failed = {
      contentId: 'x',
      contentVersion: 'v1',
      gatheredAt: T,
      results: [{ modality: 'IMAGE_FRAME', status: 'FAILED', reason: 'vision call failed' }],
    } as never;
    const r = evalSafety(failed, T);
    expect(r.state).toBe('ENGINE_ERROR');
    expect(r.publication).toBe('RESTRICTED');
  });

  it('a stale result cannot publish the current content', async () => {
    const { mayPublish, publicationStateFor } = await import('../gate/safetyResult');
    const { result } = await outcomeOf(post());
    expect(result.publication).toBe('PUBLISHED');
    expect(mayPublish(result, 'a-different-version')).toBe(false);
    expect(publicationStateFor(result, 'a-different-version')).toBe('RESTRICTED');
  });

  it('no result at all is held, never published', async () => {
    const { publicationStateFor } = await import('../gate/safetyResult');
    expect(publicationStateFor(null, 'v1')).toBe('RESTRICTED');
  });

  it('a forged publication state on a write is rejected', async () => {
    const { attemptsPublicationBypass } = await import('../gate/publicationAccess');
    for (const forged of [
      { publication_state: 'PUBLISHED' },
      { safety_state: 'SAFE' },
      { evaluated_version: 'v1' },
    ])
      expect(attemptsPublicationBypass(forged), JSON.stringify(forged)).toBe(true);
  });

  it('only PUBLISHED and legacy-NULL are publicly readable', async () => {
    const { isPubliclyReadable } = await import('../gate/publicationAccess');
    expect(isPubliclyReadable('PUBLISHED')).toBe(true);
    expect(isPubliclyReadable(null)).toBe(true);
    for (const s of ['UNDER_REVIEW', 'RESTRICTED', 'APPROVED', 'safe', ''])
      expect(isPubliclyReadable(s as never), s).toBe(false);
  });
});

describe('the author is told the truth about a published post', () => {
  it('a published post reads as published, not as "being checked", in both languages', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice');
    const { result } = await outcomeOf(post());
    const columns = { publication_state: result.publication, safety_state: result.state };
    // safety_state is LEGAL_REVIEW_REQUIRED here — the wording must not follow it.
    expect(result.state).toBe('LEGAL_REVIEW_REQUIRED');
    for (const lang of ['vi', 'en']) {
      const p = authorModerationPayload(columns, lang)!;
      expect(p.state, lang).toBe('PUBLISHED');
      expect(p.assertsViolation, lang).toBe(false);
      expect(p.detail.trim(), lang).not.toBe('');
    }
    expect(authorModerationPayload(columns, 'en')!.title).toMatch(/live/i);
    expect(authorModerationPayload(columns, 'vi')!.title).toMatch(/đã được đăng/);
  });
});

// ---------------------------------------------------------------------------
// The MVP contract: two terminal outcomes, and the reason survives the collapse
// ---------------------------------------------------------------------------

describe('every upload resolves — nothing parks in UNDER_REVIEW', () => {
  it('no safety state maps to UNDER_REVIEW any more', async () => {
    const { PUBLICATION_FOR, SAFETY_STATES } = await import('../gate/safetyResult');
    for (const s of SAFETY_STATES)
      expect(PUBLICATION_FOR[s], s).not.toBe('UNDER_REVIEW');
    expect(PUBLICATION_FOR.SAFE).toBe('PUBLISHED');
    for (const s of SAFETY_STATES)
      if (s !== 'SAFE') expect(PUBLICATION_FOR[s], s).toBe('RESTRICTED');
  });

  it('a rejected post is never publicly readable', async () => {
    const { isPubliclyReadable } = await import('../gate/publicationAccess');
    expect(isPubliclyReadable('RESTRICTED')).toBe(false);
  });
});

describe('the rejection notice tells the truth about WHY', () => {
  it('an actual violation carries the Community Guidelines warning, in both languages', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice');
    for (const lang of ['vi', 'en']) {
      const p = authorModerationPayload(
        { publication_state: 'RESTRICTED', safety_state: 'VIOLATION' },
        lang,
      )!;
      expect(p.state, lang).toBe('RESTRICTED');
      expect(p.assertsViolation, lang).toBe(true);
      expect(p.detail, lang).toContain('⚠️');
    }
    expect(
      authorModerationPayload({ publication_state: 'RESTRICTED', safety_state: 'VIOLATION' }, 'en')!.detail,
    ).toContain('Community Guidelines');
    expect(
      authorModerationPayload({ publication_state: 'RESTRICTED', safety_state: 'VIOLATION' }, 'vi')!.detail,
    ).toContain('Nguyên tắc Cộng đồng');
  });

  /**
   * The invariant the whole MVP collapse could have destroyed. Four states now
   * share VIOLATION's outcome; none of them may share its accusation.
   */
  it('an unverifiable post is rejected WITHOUT being accused, in both languages', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice');
    for (const safety of ['UNDETERMINED', 'ENGINE_ERROR', 'LEGAL_REVIEW_REQUIRED', 'HUMAN_REVIEW_REQUIRED'])
      for (const lang of ['vi', 'en']) {
        const p = authorModerationPayload(
          { publication_state: 'RESTRICTED', safety_state: safety },
          lang,
        )!;
        expect(p.state, `${safety}/${lang}`).toBe('RESTRICTED');
        expect(p.assertsViolation, `${safety}/${lang}`).toBe(false);
        expect(p.detail, `${safety}/${lang}`).not.toContain('⚠️');
        expect(p.detail, `${safety}/${lang}`).toMatch(
          lang === 'en' ? /not a finding that you did anything wrong/ : /không phải là kết luận vi phạm/,
        );
      }
  });

  it('every rejection says the post is still in the author’s profile', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice');
    for (const safety of ['VIOLATION', 'UNDETERMINED', 'ENGINE_ERROR']) {
      expect(
        authorModerationPayload({ publication_state: 'RESTRICTED', safety_state: safety }, 'en')!.detail,
      ).toMatch(/still in your profile|still yours/i);
      expect(
        authorModerationPayload({ publication_state: 'RESTRICTED', safety_state: safety }, 'vi')!.detail,
      ).toMatch(/trang cá nhân/);
    }
  });

  it('a rejection still leaks no internal detail', async () => {
    const { authorModerationPayload } = await import('../gate/authorNotice');
    for (const safety of ['VIOLATION', 'UNDETERMINED', 'ENGINE_ERROR'])
      for (const lang of ['vi', 'en']) {
        const s = JSON.stringify(
          authorModerationPayload({ publication_state: 'RESTRICTED', safety_state: safety }, lang),
        );
        for (const leak of ['ts.', 'INSUFFICIENT_EVIDENCE', 'IMAGE_FRAME', 'evaluated_version', safety])
          expect(s, `${safety}/${lang}/${leak}`).not.toContain(leak);
      }
  });
});

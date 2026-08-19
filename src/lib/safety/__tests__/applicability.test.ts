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
import { evaluateSafety } from '../gate/safetyResult';
import { aggregateWithRules, storedStateFor } from '../gate/publicationGate';
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
 * The configuration in which the two RESTRICTED-disposition policies stop gating
 * publication. Explored through `aggregateWithRules`, which exists precisely so a
 * configuration can be examined without changing what production uses.
 *
 * 🔴 NOT production. `PUBLICATION_GATE_RULES` is unchanged, and a test below
 * asserts that these two are still UNRESOLVED there, so this file can never be
 * mistaken for having made the decision.
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
    ifRestrictedOff: storedStateFor(alt.decision),
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
    it(`${c.name} is held, and never published`, async () => {
      const { heldBy, ifRestrictedOff, today } = await outcomeOf(post({ body: c.body }));
      expect(heldBy, c.name).toContain(c.expectHeldBy);
      expect(ifRestrictedOff, c.name).toBe('UNDER_REVIEW');
      expect(today, c.name).toBe('UNDER_REVIEW');
    });
  }
});

// ---------------------------------------------------------------------------
// Video, and the failure modes
// ---------------------------------------------------------------------------

describe('unknown never becomes safe', () => {
  it('a video is held under EVERY configuration — audio and frames were never seen', async () => {
    const { today, ifRestrictedOff, heldBy } = await outcomeOf(
      post({ content_type: 'video', media_url: 'https://x/v.mp4' }),
    );
    expect(today).toBe('UNDER_REVIEW');
    expect(ifRestrictedOff).toBe('UNDER_REVIEW');
    expect(heldBy.length).toBeGreaterThan(10);
  });

  it('a benign photo is held today, and only the RESTRICTED pair holds it', async () => {
    // Documents the exact decision boundary: nothing prohibitive objects.
    const { today, ifRestrictedOff, heldBy } = await outcomeOf(post());
    expect(today).toBe('UNDER_REVIEW');
    expect(heldBy).toEqual([]);
    expect(ifRestrictedOff).toBe('PUBLISHED');
  });

  it('production rules are UNCHANGED — this file decides nothing', async () => {
    const { PUBLICATION_GATE_RULES } = await import('../gate/publicationGate');
    expect(PUBLICATION_GATE_RULES['ts.graphic.presentation']).toBe('BLOCKS_PUBLICATION');
    expect(PUBLICATION_GATE_RULES['ts.sexual.adult-content']).toBe('BLOCKS_PUBLICATION');
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

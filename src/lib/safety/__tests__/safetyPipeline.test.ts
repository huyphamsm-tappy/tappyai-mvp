/**
 * The content-safety evidence pipeline and the publication gate.
 *
 * The claim under test is not "the pipeline detects things". It is that the gate
 * is safe while evidence coverage is thin: nothing unexamined publishes, nothing
 * uncertain becomes a violation, and no failure is ever mistaken for a clean
 * result.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  MODALITIES,
  allContactIdentifiers,
  coverageGaps,
  hasFailure,
  mediaWasExamined,
  resultFor,
  type EvidenceBundle,
  type ModalityResult,
} from '../evidence/types';
import {
  SUPPORTED_MODALITIES,
  UNSUPPORTED_MODALITIES,
  audioSpeechEvidence,
  contactIdentifiersIn,
  imageFrameEvidence,
  metadataEvidence,
  parseFrameObservation,
  textEvidence,
  videoFramesEvidence,
} from '../evidence/modalities';
import { evidenceIsStale, safetyContentVersion, type SafetySubject } from '../evidence/pipeline';
import {
  OBSERVABLE_POLICIES,
  POLICY_OBSERVABILITY,
  privacySignalsFrom,
  signalsFor,
} from '../mapping/policySignals';
import {
  PUBLICATION_FOR,
  SAFETY_STATES,
  deriveSafetyState,
  evaluateSafety,
  mayPublish,
  publicationFor,
  publicationStateFor,
  type PolicyOutcomeLine,
  type SafetyState,
} from '../gate/safetyResult';
import { NOTICE_FOR, authorModerationPayload, noticeFor, noticeIsTruthful } from '../gate/authorNotice';
import { POLICY_REGISTRY } from '@/lib/policy/source/registry';

const T = '2026-08-17T14:00:00Z';

const bundle = (results: ModalityResult[], over: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
  contentId: 'clip-1',
  contentVersion: 'v1',
  gatheredAt: T,
  results,
  ...over,
});

const observed = (m: (typeof MODALITIES)[number], over: Record<string, unknown> = {}): ModalityResult =>
  ({ modality: m, status: 'OBSERVED', ...over }) as ModalityResult;

// ---------------------------------------------------------------------------
// Modalities
// ---------------------------------------------------------------------------

describe('modalities', () => {
  it('three run, two are declared unavailable with a reason', () => {
    expect([...SUPPORTED_MODALITIES]).toEqual(['TEXT', 'METADATA', 'IMAGE_FRAME']);
    expect([...UNSUPPORTED_MODALITIES]).toEqual(['VIDEO_FRAMES', 'AUDIO_SPEECH']);
    for (const r of [videoFramesEvidence(), audioSpeechEvidence()]) {
      expect(r.status).toBe('UNAVAILABLE');
      expect('reason' in r && r.reason.length).toBeGreaterThan(10);
    }
  });

  it('"unavailable" is never confused with "observed nothing"', () => {
    const nothingFound = textEvidence({ body: 'Quán này ngon', hashtags: [] });
    expect(nothingFound.status).toBe('OBSERVED');
    expect(videoFramesEvidence().status).toBe('UNAVAILABLE');
    // The gate must be able to tell these apart, and does.
    expect(nothingFound.status).not.toBe(videoFramesEvidence().status);
  });

  it('text evidence reads contact identifiers from the caption', () => {
    const r = textEvidence({ body: 'gọi 0912 345 678 nhé', hashtags: ['anuong'] });
    expect(r.status).toBe('OBSERVED');
    expect(r.status === 'OBSERVED' && r.contactIdentifiers).toContain('0912345678');
  });

  it('a FILENAME is never evidence, however contact-shaped it is', () => {
    // The uploader chooses the filename, so it describes nothing about the
    // content. Asserting the key is absent from the output would be decorative —
    // the real question is whether a number hidden in a filename can reach the
    // identifier list. It must not.
    const withFilename = textEvidence({
      body: 'Quán này ngon',
      hashtags: ['anuong'],
      // deliberately smuggled in as an extra field
      ...({ filename: 'video-0912345678.mp4' } as Record<string, unknown>),
    });
    expect(withFilename.status).toBe('OBSERVED');
    expect(withFilename.status === 'OBSERVED' && withFilename.contactIdentifiers).toEqual([]);

    // ...and the same through metadata, which also takes a row-shaped object.
    const meta = metadataEvidence({
      place_name: 'Quán Ngon',
      ...({ filename: 'clip-0987654321.mp4', media_url: 'https://x/0987654321.mp4' } as Record<
        string,
        unknown
      >),
    });
    expect(meta.status === 'OBSERVED' && (meta.descriptors ?? []).join(' ')).not.toContain(
      '0987654321',
    );
  });

  it('metadata contributes the business-contact fact the row already holds', () => {
    const r = metadataEvidence({
      place_name: 'Quán Ngon',
      place_address: '12 Lê Lợi — 0912345678',
      content_type: 'video',
      source_type: 'original',
    });
    expect(r.status === 'OBSERVED' && r.descriptors).toContain('businessContact:0912345678');
    expect(r.status === 'OBSERVED' && r.descriptors).toContain('contentType:video');
  });

  it('a price is not a phone number', () => {
    expect(contactIdentifiersIn('món này 100.000.000đ')).toEqual([]);
  });

  it('the frame reply parser refuses to guess', () => {
    expect(parseFrameObservation('TEXT: NONE\nSUBJECTS: NONE')).toEqual({
      recognisedText: '',
      descriptors: [],
    });
    expect(parseFrameObservation('garbage')).toEqual({ recognisedText: '', descriptors: [] });
    const parsed = parseFrameObservation('TEXT: gọi 0912345678\nSUBJECTS: bún chả, quán ăn');
    expect(parsed.recognisedText).toContain('0912345678');
    expect(parsed.descriptors).toEqual(['bún chả', 'quán ăn']);
  });

  it('no image reference means UNAVAILABLE, not a clean frame', async () => {
    const r = await imageFrameEvidence({ imageUrl: '' });
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('a non-https reference is not fetched', async () => {
    const r = await imageFrameEvidence({ imageUrl: 'file:///etc/passwd' });
    expect(r.status).toBe('UNAVAILABLE');
  });

  it('a vision failure is FAILED, never an empty observation', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/llm', () => ({
      AI: { vision: () => Promise.reject(new Error('upstream down')) },
    }));
    const { imageFrameEvidence: fresh } = await import('../evidence/modalities');
    const r = await fresh({ imageUrl: 'https://example.com/a.jpg' });
    expect(r.status).toBe('FAILED');
    vi.doUnmock('@/lib/ai/llm');
    vi.resetModules();
  });

  it('a successful vision call yields observations, including on-screen identifiers', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ai/llm', () => ({
      AI: {
        vision: () =>
          Promise.resolve({ text: 'TEXT: Hotline 0912 345 678\nSUBJECTS: biển hiệu, quán ăn' }),
      },
    }));
    const { imageFrameEvidence: fresh } = await import('../evidence/modalities');
    const r = await fresh({ imageUrl: 'https://example.com/a.jpg' });
    expect(r.status).toBe('OBSERVED');
    expect(r.status === 'OBSERVED' && r.contactIdentifiers).toContain('0912345678');
    vi.doUnmock('@/lib/ai/llm');
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

describe('evidence bundles', () => {
  it('records every modality exactly once, run or not', () => {
    const b = bundle([
      textEvidence({}),
      metadataEvidence({}),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]);
    for (const m of ['TEXT', 'METADATA', 'VIDEO_FRAMES', 'AUDIO_SPEECH'] as const) {
      expect(resultFor(b, m), m).toBeDefined();
    }
  });

  it('knows whether the media itself was examined', () => {
    const textOnly = bundle([textEvidence({}), metadataEvidence({}), videoFramesEvidence()]);
    expect(mediaWasExamined(textOnly)).toBe(false);
    const withFrame = bundle([...textOnly.results, observed('IMAGE_FRAME')]);
    expect(mediaWasExamined(withFrame)).toBe(true);
  });

  it('reports coverage gaps rather than hiding them', () => {
    const b = bundle([videoFramesEvidence(), audioSpeechEvidence()]);
    expect(coverageGaps(b)).toHaveLength(2);
  });

  it('unions identifiers across modalities — a frame counts even with an empty caption', () => {
    const b = bundle([
      observed('TEXT', { contactIdentifiers: [] }),
      observed('IMAGE_FRAME', { contactIdentifiers: ['0912345678'] }),
    ]);
    expect(allContactIdentifiers(b)).toEqual(['0912345678']);
  });

  it('an empty frame never cancels an identifier the caption carried', () => {
    const b = bundle([
      observed('TEXT', { contactIdentifiers: ['0987654321'] }),
      observed('IMAGE_FRAME', { contactIdentifiers: [] }),
    ]);
    expect(allContactIdentifiers(b)).toEqual(['0987654321']);
  });
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe('evidence → policy signals', () => {
  it('declares observability for all eighteen policies, exactly once each', () => {
    const ids = POLICY_OBSERVABILITY.map((p) => p.policy).sort();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(POLICY_REGISTRY.map((r) => r.identity).sort());
  });

  it('only one policy is currently reachable by observation, and it is P1', () => {
    expect([...OBSERVABLE_POLICIES]).toEqual(['ts.privacy.personal-information']);
  });

  it('every other policy receives no signals — the honest empty object', () => {
    const b = bundle([observed('IMAGE_FRAME', { descriptors: ['blood', 'knife', 'animal'] })]);
    for (const p of POLICY_OBSERVABILITY.filter((x) => !x.establishedByObservation)) {
      expect(signalsFor(p.policy, b), p.policy).toEqual({});
    }
  });

  it('TOP-1: descriptors are topics and establish nothing, for any policy', () => {
    const b = bundle([
      observed('IMAGE_FRAME', {
        descriptors: ['blood', 'knife', 'nudity', 'animal', 'child', 'weapon'],
        contactIdentifiers: [],
      }),
    ]);
    for (const p of POLICY_OBSERVABILITY) {
      const signals = signalsFor(p.policy, b);
      expect(Object.values(signals), p.policy).not.toContain(true);
    }
  });

  it('P1: identifiers establish presence, never consent', () => {
    const b = bundle([observed('TEXT', { contactIdentifiers: ['0987654321'] })]);
    const s = privacySignalsFrom(b);
    expect(s.identifyingInformationPresent).toBe(true);
    expect(s).not.toHaveProperty('consentEvidence');
    expect(Object.keys(s)).not.toContain('subjectIsAnotherPerson');
  });

  it('P1: never writes "no identifying information" — absence is not established', () => {
    expect(privacySignalsFrom(bundle([observed('TEXT', { contactIdentifiers: [] })]))).toEqual({});
  });

  it("P1: the post's own place contact is the business carve-out", () => {
    const b = bundle([
      observed('TEXT', { contactIdentifiers: ['0912345678'] }),
      observed('METADATA', { descriptors: ['businessContact:0912345678'] }),
    ]);
    expect(privacySignalsFrom(b).subjectIsBusinessContact).toBe(true);
  });

  it("P1: someone else's number alongside the business number is NOT carved out", () => {
    const b = bundle([
      observed('TEXT', { contactIdentifiers: ['0912345678', '0987654321'] }),
      observed('METADATA', { descriptors: ['businessContact:0912345678'] }),
    ]);
    expect(privacySignalsFrom(b).subjectIsBusinessContact).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Safety state
// ---------------------------------------------------------------------------

describe('safety state derivation', () => {
  const line = (outcome: string, over: Partial<PolicyOutcomeLine> = {}): PolicyOutcomeLine => ({
    policy: 'ts.fraud.scam',
    outcome,
    ...over,
  });

  it('an evidence failure is ENGINE_ERROR, never SAFE and never VIOLATION', () => {
    expect(deriveSafetyState([line('NOT_APPLICABLE')], true)).toBe('ENGINE_ERROR');
    expect(deriveSafetyState([line('VIOLATION')], true)).toBe('ENGINE_ERROR');
  });

  it('a policy-level engine error outranks everything except nothing', () => {
    expect(deriveSafetyState([line('ENGINE_ERROR'), line('NOT_APPLICABLE')], false)).toBe(
      'ENGINE_ERROR',
    );
  });

  it('all clear is SAFE', () => {
    expect(deriveSafetyState([line('NOT_APPLICABLE'), line('APPLICABLE_NO_VIOLATION')], false)).toBe(
      'SAFE',
    );
  });

  it('uncertainty is UNDETERMINED, never SAFE', () => {
    expect(deriveSafetyState([line('NOT_APPLICABLE'), line('INSUFFICIENT_EVIDENCE')], false)).toBe(
      'UNDETERMINED',
    );
    expect(deriveSafetyState([line('INDETERMINATE_CONTEXT')], false)).toBe('UNDETERMINED');
  });

  it('a human-review gate outranks ordinary uncertainty', () => {
    expect(
      deriveSafetyState(
        [line('INSUFFICIENT_EVIDENCE'), line('INSUFFICIENT_EVIDENCE', { gate: 'HUMAN_REVIEW_REQUIRED' })],
        false,
      ),
    ).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('a Legal dependency outranks human review', () => {
    expect(
      deriveSafetyState(
        [
          line('INSUFFICIENT_EVIDENCE', { gate: 'HUMAN_REVIEW_REQUIRED' }),
          { policy: 'ts.hate.protected-target-abuse', outcome: 'INSUFFICIENT_EVIDENCE' },
        ],
        false,
      ),
    ).toBe('LEGAL_REVIEW_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('the publication gate', () => {
  it('only SAFE publishes; only VIOLATION restricts; every other state waits', () => {
    expect(PUBLICATION_FOR).toEqual({
      SAFE: 'PUBLISHED',
      VIOLATION: 'RESTRICTED',
      UNDETERMINED: 'UNDER_REVIEW',
      HUMAN_REVIEW_REQUIRED: 'UNDER_REVIEW',
      LEGAL_REVIEW_REQUIRED: 'UNDER_REVIEW',
      ENGINE_ERROR: 'UNDER_REVIEW',
    });
    for (const s of SAFETY_STATES) {
      if (s !== 'SAFE') expect(publicationFor(s), s).not.toBe('PUBLISHED');
    }
  });

  it('a failure to evaluate never publishes', () => {
    expect(publicationFor('ENGINE_ERROR')).toBe('UNDER_REVIEW');
    expect(publicationFor('UNDETERMINED')).toBe('UNDER_REVIEW');
  });

  it('no result at all means under review, not published', () => {
    expect(publicationStateFor(null, 'v1')).toBe('UNDER_REVIEW');
  });

  it('a result for another version cannot publish this one', () => {
    const safe = {
      contentId: 'c',
      contentVersion: 'v1',
      evaluatedAt: T,
      state: 'SAFE' as SafetyState,
      publication: 'PUBLISHED' as const,
      gate: {
        decision: 'PUBLISHED' as const,
        blockedBy: [],
        unresolved: [],
        notBlocking: [],
      },
      policies: [],
      coverageGaps: [],
    };
    expect(mayPublish(safe, 'v1')).toBe(true);
    expect(mayPublish(safe, 'v2')).toBe(false);
    expect(publicationStateFor(safe, 'v2')).toBe('UNDER_REVIEW');
  });

  it('the fingerprint changes when examined content changes, and not otherwise', () => {
    const base: SafetySubject = { id: 'c', body: 'a', hashtags: ['x'], media_url: 'u', thumbnail: 't' };
    expect(safetyContentVersion({ ...base, body: 'b' })).not.toBe(safetyContentVersion(base));
    expect(safetyContentVersion({ ...base, thumbnail: 't2' })).not.toBe(safetyContentVersion(base));
    // Fields the pipeline does not examine must not churn the fingerprint.
    expect(safetyContentVersion({ ...base, place_name: 'zzz' } as SafetySubject)).toBe(
      safetyContentVersion(base),
    );
  });

  it('stale evidence is detectable', () => {
    expect(evidenceIsStale(bundle([]), 'v2')).toBe(true);
    expect(evidenceIsStale(bundle([]), 'v1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End to end, with today's real coverage
// ---------------------------------------------------------------------------

describe('evaluating a real bundle', () => {
  /**
   * This test used to assert the bug. A completely benign, completely examined
   * post was held, because "examined and not in play" had no representation —
   * see `applicability.ts`. It now asserts the fix, and the two things that must
   * remain true alongside it: every policy still evaluates, and the video/audio
   * coverage gaps are still REPORTED even for an item they cannot apply to.
   */
  it('a benign, completely examined post PUBLISHES', () => {
    const b = bundle([
      textEvidence({ body: 'Quán bún chả ngon', hashtags: ['anuong'] }),
      metadataEvidence({ place_name: 'Bún Chả', place_address: '24 Lê Văn Hưu' }),
      observed('IMAGE_FRAME', { descriptors: ['bún chả'], contactIdentifiers: [] }),
      videoFramesEvidence(),
      audioSpeechEvidence(),
    ]);
    const result = evaluateSafety(b, T);
    expect(result.publication).toBe('PUBLISHED');
    // 🔑 The safety state still reports the open Legal dependency, because the
    // hate policy is Legal-blocked for every item. The two layers answer
    // different questions and neither is rewritten to agree with the other —
    // which is exactly why `authorModerationPayload` keys its wording off the
    // publication state rather than off this.
    expect(result.state).toBe('LEGAL_REVIEW_REQUIRED');
    expect(result.policies).toHaveLength(18);
    // The gaps are irrelevant to a post with no video and no audio, but they are
    // still carried rather than quietly dropped.
    expect(result.coverageGaps).toHaveLength(2);
  });

  it('every one of the eighteen appears in the result — none silently vanishes', () => {
    const result = evaluateSafety(bundle([textEvidence({})]), T);
    expect(result.policies.map((p) => p.policy).sort()).toEqual(
      POLICY_REGISTRY.map((r) => r.identity).sort(),
    );
  });

  it('an evidence failure anywhere makes the whole result ENGINE_ERROR', () => {
    const b = bundle([
      textEvidence({}),
      { modality: 'IMAGE_FRAME', status: 'FAILED', reason: 'vision call failed' },
    ]);
    expect(hasFailure(b)).toBe(true);
    const result = evaluateSafety(b, T);
    expect(result.state).toBe('ENGINE_ERROR');
    expect(result.publication).toBe('UNDER_REVIEW');
  });

  it('the result carries no content, no identity and no raw text', () => {
    const b = bundle([
      textEvidence({ body: 'gọi 0987654321 gặp chị Lan', hashtags: [] }),
      observed('IMAGE_FRAME', { recognisedText: 'Hotline 0987654321' }),
    ]);
    const serialised = JSON.stringify(evaluateSafety(b, T));
    for (const secret of ['0987654321', 'chị Lan', 'Hotline'])
      expect(serialised, secret).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------
// Author notice
// ---------------------------------------------------------------------------

describe('author notice', () => {
  it('only a real violation may assert a violation — checked for every state', () => {
    for (const s of SAFETY_STATES) expect(noticeIsTruthful(s), s).toBe(true);
  });

  it('uncertainty tells the author it is not a violation, in words', () => {
    for (const s of ['UNDETERMINED', 'HUMAN_REVIEW_REQUIRED', 'LEGAL_REVIEW_REQUIRED', 'ENGINE_ERROR'] as const) {
      expect(noticeFor(s).assertsViolation, s).toBe(false);
      expect(noticeFor(s).detail, s).toContain('không phải là kết luận vi phạm');
    }
  });

  it('a safe post is not notified at all', () => {
    expect(noticeFor('SAFE').notify).toBe(false);
  });

  it('the notice carries no action vocabulary — it is text, not enforcement', () => {
    for (const s of SAFETY_STATES) {
      const n = NOTICE_FOR[s];
      expect(Object.keys(n).sort()).toEqual([
        'assertsViolation',
        'detail',
        'detail_en',
        'notify',
        'title',
        'title_en',
      ]);
      // Both languages, or the English edition becomes the place enforcement
      // vocabulary can hide.
      expect(`${n.title} ${n.detail}`.toLowerCase()).not.toMatch(/xoá vĩnh viễn|khoá tài khoản|ban\b/);
      expect(`${n.title_en} ${n.detail_en}`.toLowerCase()).not.toMatch(
        /permanently deleted|account (locked|suspended|disabled)|banned|taken down/,
      );
    }
  });

  it('English says the same thing as Vietnamese about violation vs uncertainty', () => {
    // The risk of a second language is that it drifts into an accusation the
    // first one does not make. Non-violation states must reassure in BOTH.
    for (const s of SAFETY_STATES) {
      if (s === 'SAFE' || s === 'VIOLATION') continue;
      expect(noticeFor(s, 'en').detail, s).toContain('not a finding that you did anything wrong');
      expect(noticeFor(s, 'vi').detail, s).toContain('không phải là kết luận vi phạm');
      expect(noticeFor(s, 'en').assertsViolation, s).toBe(false);
    }
    expect(noticeFor('VIOLATION', 'en').assertsViolation).toBe(true);
  });

  it('an unrecognised locale degrades to Vietnamese, never to a blank notice', () => {
    for (const s of SAFETY_STATES) {
      if (s === 'SAFE') continue;
      for (const lang of ['', 'fr', 'EN', 'vi-VN', 'xx']) {
        const n = noticeFor(s, lang);
        expect(n.title.trim(), `${s}/${lang}`).not.toBe('');
        expect(n.detail.trim(), `${s}/${lang}`).not.toBe('');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// What the author's own client is told
// ---------------------------------------------------------------------------

/**
 * The gate was silent before this: a held post returned `ok: true` and then
 * never appeared, which reads as the product losing the post. These pin the
 * honest middle ground — the author learns the visibility of their own post and
 * that it is not an accusation, and learns nothing about WHICH check held it.
 */
describe('author moderation payload', () => {
  const held = { publication_state: 'UNDER_REVIEW', safety_state: 'LEGAL_REVIEW_REQUIRED' };

  it('is null while the gate is inactive, so an off gate changes no response', () => {
    expect(authorModerationPayload({}, 'vi')).toBeNull();
    expect(authorModerationPayload({}, 'en')).toBeNull();
  });

  it('never invents a state it was not given', () => {
    expect(authorModerationPayload({ publication_state: 'SOMETHING_NEW' }, 'vi')).toBeNull();
    expect(authorModerationPayload({ safety_state: 'SAFE' }, 'vi')).toBeNull();
  });

  it('tells the author a held post is held, in both languages, without accusing them', () => {
    for (const lang of ['vi', 'en']) {
      const p = authorModerationPayload(held, lang)!;
      expect(p.state).toBe('UNDER_REVIEW');
      expect(p.assertsViolation).toBe(false);
      expect(p.title.trim()).not.toBe('');
      expect(p.detail.trim()).not.toBe('');
    }
    expect(authorModerationPayload(held, 'en')!.detail).toContain(
      'not a finding that you did anything wrong',
    );
    expect(authorModerationPayload(held, 'vi')!.detail).toContain('không phải là kết luận vi phạm');
  });

  it('only a real violation is reported as one', () => {
    const violation = { publication_state: 'RESTRICTED', safety_state: 'VIOLATION' };
    expect(authorModerationPayload(violation, 'vi')!.assertsViolation).toBe(true);
    expect(authorModerationPayload(held, 'vi')!.assertsViolation).toBe(false);
  });

  /** The bypass-relevant one: knowing WHICH check held it is knowing what to change. */
  it('leaks no internal reason, policy identity or evidence detail', () => {
    for (const lang of ['vi', 'en']) {
      const serialised = JSON.stringify(authorModerationPayload(held, lang));
      for (const leak of [
        'LEGAL_REVIEW_REQUIRED',
        'safety_state',
        'evaluated_version',
        'INSUFFICIENT_EVIDENCE',
        'ts.',
        'IMAGE_FRAME',
        'modality',
      ])
        expect(serialised, `${lang}/${leak}`).not.toContain(leak);
    }
  });

  it('an unrecognised safety state still produces an honest held message', () => {
    // A state this build does not know about must not fall through to silence,
    // and must not be upgraded into an accusation.
    const p = authorModerationPayload(
      { publication_state: 'UNDER_REVIEW', safety_state: 'SOMETHING_ADDED_LATER' },
      'en',
    )!;
    expect(p.state).toBe('UNDER_REVIEW');
    expect(p.assertsViolation).toBe(false);
    expect(p.detail.trim()).not.toBe('');
  });
});

/**
 * EXPLORE INTEGRATION READINESS.
 *
 * Two jobs:
 *
 *   1. Prove the integration contract behaves safely in every failure mode a
 *      real feed will hit — missing classification, engine error, stale result,
 *      no policies, several policies, Legal blocked, RESTRICTED, uncertainty.
 *
 *   2. Prove, by scanning the source, that NONE of this is switched on: no
 *      production route imports it, it writes nothing, schedules nothing, and
 *      calls no action layer. "Prepared" and "activated" must be
 *      distinguishable by machine, not by memory.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FEED_TREATMENT_RENDER_UNCHANGED,
  classifyExploreContent,
  contentVersionFrom,
  currentStates,
  feedTreatment,
  isStale,
  type ExploreClassificationInput,
} from '../explore/contentClassification';
import { evaluatePolicy, type EvaluationInput, type PolicyDecision } from '../engine/evaluator';
import type { Expression } from '../engine/expression';
import { POLICY_REGISTRY } from '../source/registry';

const T1 = '2026-08-16T10:00:00Z';
const LEGAL_POLICY = 'ts.hate.protected-target-abuse';

const P = {
  TRUE: { op: 'eq', left: { value: 1 }, right: { value: 1 } } as Expression,
  FALSE: { op: 'eq', left: { value: 1 }, right: { value: 2 } } as Expression,
  UNKNOWN: { op: 'eq', left: { ref: 'unestablished' }, right: { value: 1 } } as Expression,
};

const recordOf = (id: string) => {
  const r = POLICY_REGISTRY.find((x) => x.identity === id);
  if (!r) throw new Error(`registry missing ${id}`);
  return r;
};

const evaluate = (policy: string, input: Partial<EvaluationInput> = {}): PolicyDecision =>
  evaluatePolicy(recordOf(policy), { subject: {}, asOf: T1, predicate: P.TRUE, ...input });

const input = (over: Partial<ExploreClassificationInput> = {}): ExploreClassificationInput => ({
  contentId: 'review-1',
  contentVersion: 'v1',
  policyDecisions: [evaluate('ts.fraud.scam')],
  evaluatedAt: T1,
  ...over,
});

// ---------------------------------------------------------------------------
// Content version — the Q3 mechanism, working on a table with no updated_at
// ---------------------------------------------------------------------------

describe('content version', () => {
  const post = { body: 'Quán này ngon', hashtags: ['anuong'], media_url: 'https://x/y.mp4' };

  it('is stable for identical content and independent of field order', () => {
    const reordered = { media_url: post.media_url, hashtags: post.hashtags, body: post.body };
    expect(contentVersionFrom(post)).toBe(contentVersionFrom(reordered));
  });

  it('changes when the classified content changes', () => {
    expect(contentVersionFrom({ ...post, body: 'Quán này dở' })).not.toBe(contentVersionFrom(post));
    expect(contentVersionFrom({ ...post, hashtags: ['anuong', 'saigon'] })).not.toBe(
      contentVersionFrom(post),
    );
    expect(contentVersionFrom({ ...post, media_url: null })).not.toBe(contentVersionFrom(post));
  });

  it('distinguishes an empty field from an absent one', () => {
    expect(contentVersionFrom({ body: '' })).not.toBe(contentVersionFrom({ body: null }));
  });
});

// ---------------------------------------------------------------------------
// Failure safety
// ---------------------------------------------------------------------------

describe('failure safety', () => {
  const noAction = (keys: string[], label: string) => {
    for (const forbidden of ['action', 'severity', 'rank', 'score', 'hide', 'visible', 'suppress']) {
      expect(keys, `${label}.${forbidden}`).not.toContain(forbidden);
    }
  };

  it('1. no classification available — the caller gets nothing, not a guess', () => {
    // There is no "default classification" to fall back to: `currentStates`
    // returns null, and null is not a state that renders differently.
    const c = classifyExploreContent(input());
    expect(currentStates(c, 'v-other').states).toBeNull();
  });

  it('2. engine error flows through as a non-finding', () => {
    const malformed = evaluate('ts.fraud.scam', {
      predicate: { op: 'nope', left: { value: 1 } } as unknown as Expression,
    });
    const c = classifyExploreContent(input({ policyDecisions: [malformed] }));
    expect(c.states[0].state).not.toBe('POLICY_CONSTITUTED');
    expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });

  it('3. stale classification is withheld, not reinterpreted', () => {
    const c = classifyExploreContent(input({ policyDecisions: [evaluate('ts.fraud.scam')] }));
    expect(c.states[0].state).toBe('POLICY_CONSTITUTED');
    expect(isStale(c, 'v2')).toBe(true);
    const now = currentStates(c, 'v2');
    expect(now.states).toBeNull();
    // Not softened to presentable, and not hardened either.
    expect(now).not.toHaveProperty('fallback');
  });

  it('4. empty policy result is a legitimate answer, not an error', () => {
    const c = classifyExploreContent(input({ policyDecisions: [] }));
    expect(c.states).toEqual([]);
    expect(c.combined).toBeNull();
    expect(currentStates(c, 'v1').states).toEqual([]);
  });

  it('5. several policies stay side by side with no precedence', () => {
    const c = classifyExploreContent(
      input({
        policyDecisions: [
          evaluate('ts.fraud.scam'),
          evaluate('ts.graphic.presentation'),
          evaluate('ts.harassment.targeted', { predicate: P.UNKNOWN }),
        ],
      }),
    );
    expect(c.states.map((s) => s.state)).toEqual([
      'POLICY_CONSTITUTED',
      'PRESENTATION_CONDITIONS',
      'UNDETERMINED_EVIDENCE',
    ]);
    expect(c.combined).toBeNull();
  });

  it('6. Legal blocked keeps its own state and its blocker id', () => {
    const c = classifyExploreContent(input({ policyDecisions: [evaluate(LEGAL_POLICY)] }));
    expect(c.states[0].state).toBe('UNDECIDABLE_LEGAL_BLOCKED');
    expect(c.states[0].blockedBy).toBe('G02-D-07b');
    expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
  });

  it('7. RESTRICTED is never a violation and never an action', () => {
    for (const id of ['ts.graphic.presentation', 'ts.sexual.adult-content']) {
      const c = classifyExploreContent(input({ policyDecisions: [evaluate(id)] }));
      expect(c.states[0].state, id).toBe('PRESENTATION_CONDITIONS');
      noAction(Object.keys(c.states[0]), id);
      expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
    }
  });

  it('8. uncertain evidence and unreadable context never escalate', () => {
    const cases: Array<[string, Partial<EvaluationInput>]> = [
      ['ts.harassment.targeted', { predicate: P.UNKNOWN }],
      ['ts.danger.harmful-activity', { contextUnreadable: true }],
      ['ts.fraud.scam', { predicate: P.TRUE, defeatingContext: P.UNKNOWN }],
    ];
    for (const [policy, over] of cases) {
      const c = classifyExploreContent(input({ policyDecisions: [evaluate(policy, over)] }));
      expect(['UNDETERMINED_EVIDENCE', 'UNDETERMINED_CONTEXT'], policy).toContain(c.states[0].state);
      expect(feedTreatment(c.states[0].state)).toBe(FEED_TREATMENT_RENDER_UNCHANGED);
    }
  });

  it('in every case above, nothing changes visibility or ranking — there is no such field', () => {
    for (const r of POLICY_REGISTRY) {
      const c = classifyExploreContent(input({ policyDecisions: [evaluate(r.identity)] }));
      noAction(Object.keys(c), r.identity);
      for (const s of c.states) noAction(Object.keys(s), r.identity);
    }
  });
});

// ---------------------------------------------------------------------------
// Production boundary — prepared, NOT activated
// ---------------------------------------------------------------------------

describe('production boundary', () => {
  const SRC = path.resolve(__dirname, '../../..'); // src/
  const POLICY_DIR = path.resolve(__dirname, '..'); // src/lib/policy

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (entry === 'node_modules' || entry === '.next') return [];
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(full) ? [full] : [];
    });
  }

  const outsidePolicy = sources(SRC).filter((f) => !f.startsWith(POLICY_DIR));

  /**
   * ⚠ STATE CHANGE, Owner decision 2026-08-17: P1 is wired into the Explore feed
   * route. These two guards previously asserted "nothing outside the module
   * imports it" and "the feed route is untouched". Both were re-pinned to the
   * new state rather than relaxed — the surface is now exactly one importer and
   * exactly one imported symbol, which is a narrower claim than "none", not a
   * weaker one. Everything else about the boundary is unchanged and still
   * asserted below.
   */
  const FEED_ROUTE = 'app/api/reviews/feed/route.ts';

  it('exactly one file outside the policy module imports it, and it is the Explore feed route', () => {
    const importers = outsidePolicy.filter((f) =>
      /from\s+['"](?:@\/lib\/policy|\.\.?\/(?:\.\.\/)*lib\/policy)/.test(readFileSync(f, 'utf8')),
    );
    expect(importers.map((f) => path.relative(SRC, f).replace(/\\/g, '/'))).toEqual([FEED_ROUTE]);
  });

  it('the feed route imports the observation entry point and nothing else from the module', () => {
    const feed = readFileSync(path.join(SRC, FEED_ROUTE), 'utf8');
    const imports = [...feed.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*lib\/policy[^'"]*)['"]/g)];
    expect(imports).toHaveLength(1);
    expect(imports[0][1].trim()).toBe('observePrivacyForFeed');
    expect(imports[0][2]).toBe('@/lib/policy/explore/reviewFeedObservation');
  });

  it('the feed route reaches no classification, presentation or treatment internals', () => {
    const feed = readFileSync(path.join(SRC, FEED_ROUTE), 'utf8');
    for (const internal of [
      'classifyExploreContent',
      'explorePresentation',
      'feedTreatment',
      'evaluatePolicy',
      'POLICY_REGISTRY',
      'ObservationRecord',
    ]) {
      expect(feed, internal).not.toMatch(new RegExp(`\\b${internal}\\b`));
    }
  });

  /**
   * The check, as a predicate, so the same code that guards the real route can
   * be pointed at a deliberately-bad route and shown to reject it.
   *
   * A source-scanning guard that has never been shown to fail is not evidence.
   * Mutating the real route to prove it would mean briefly writing the leak this
   * guard exists to forbid, so the counter-example is synthetic instead.
   */
  const observationIsSealedOff = (source: string): boolean =>
    /^\s*observePrivacyForFeed\(.*\)\s*$/m.test(source) &&
    !/(?:const|let|var)\s+\w+\s*=\s*observePrivacyForFeed/.test(source) &&
    source.indexOf('observePrivacyForFeed(served') > source.indexOf('NextResponse.json({ reviews:') &&
    source.includes('NextResponse.json({ reviews:');

  it('the observation cannot reach the response: it runs after it, and its result is never bound', () => {
    expect(observationIsSealedOff(readFileSync(path.join(SRC, FEED_ROUTE), 'utf8'))).toBe(true);
  });

  it('...and that check actually rejects the shapes it is meant to catch', () => {
    const bound = `
      const served = enriched.map(stripUnservableMedia)
      const res = NextResponse.json({ reviews: served, page, limit })
      const observed = observePrivacyForFeed(served, iso)
      return res`;
    const beforeResponse = `
      observePrivacyForFeed(served, iso)
      const res = NextResponse.json({ reviews: served, page, limit })
      return res`;
    const absent = `
      const res = NextResponse.json({ reviews: served, page, limit })
      return res`;
    for (const bad of [bound, beforeResponse, absent]) {
      expect(observationIsSealedOff(bad)).toBe(false);
    }
  });

  it('the served payload still carries exactly the three fields it always did', () => {
    const feed = readFileSync(path.join(SRC, FEED_ROUTE), 'utf8');
    expect(feed).toMatch(/NextResponse\.json\(\{\s*reviews:\s*served,\s*page,\s*limit\s*\}\)/);
    // The rows handed to the client are still the media-stripped enriched rows,
    // with nothing from the policy layer merged in.
    expect(feed).toMatch(/const\s+served\s*=\s*enriched\.map\(stripUnservableMedia\)/);
  });

  it('the policy module performs no writes, no scheduling and no network', () => {
    const forbidden: Array<[RegExp, string]> = [
      [/\.(insert|update|upsert|delete)\s*\(/, 'database write'],
      [/createClient\s*\(/, 'database client'],
      [/\bfetch\s*\(/, 'network call'],
      [/setTimeout|setInterval|cron/i, 'scheduler'],
      [/writeFileSync|appendFileSync/, 'file write'],
      [/emitNotification|sendNotification/, 'notification'],
    ];
    const offenders: string[] = [];
    for (const file of sources(POLICY_DIR)) {
      if (file.includes('__tests__')) continue;
      const text = readFileSync(file, 'utf8');
      for (const [re, label] of forbidden) {
        if (re.test(text)) offenders.push(`${path.relative(POLICY_DIR, file)}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the policy module calls no moderation or action layer', () => {
    const offenders: string[] = [];
    for (const file of sources(POLICY_DIR)) {
      if (file.includes('__tests__')) continue;
      const text = readFileSync(file, 'utf8');
      if (/moderation_queue|moderation_actions|is_hidden\s*[:=]/.test(text)) {
        offenders.push(path.relative(POLICY_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Access control and client bypass for the publication gate.
 *
 * These are the tests that decide whether the gate is real. Classification is
 * interesting; whether unpublished content can be fetched is what actually
 * matters to a user whose post is being held.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PUBLISHABLE_FILTER,
  SERVER_CONTROLLED_FIELDS,
  attemptsPublicationBypass,
  effectivePublicationState,
  isPubliclyReadable,
  publiclyReadableOnly,
  publishableFilter,
  stripServerControlledFields,
  type StoredPublicationState,
} from '../gate/publicationAccess';

const SRC = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

describe('public readability', () => {
  it('PUBLISHED and legacy-NULL are public; nothing else is', () => {
    expect(isPubliclyReadable('PUBLISHED')).toBe(true);
    expect(isPubliclyReadable(null)).toBe(true);
    expect(isPubliclyReadable(undefined)).toBe(true);
    expect(isPubliclyReadable('UNDER_REVIEW')).toBe(false);
    expect(isPubliclyReadable('RESTRICTED')).toBe(false);
  });

  it('an UNKNOWN state is never public — allow-list, not deny-list', () => {
    for (const weird of ['published', 'Published', 'OK', '', 'APPROVED', 'null'] as unknown[]) {
      expect(isPubliclyReadable(weird as StoredPublicationState), String(weird)).toBe(false);
    }
  });

  it('filters a page down to publishable rows only', () => {
    const rows = [
      { id: 'a', publication_state: 'PUBLISHED' as const },
      { id: 'b', publication_state: 'UNDER_REVIEW' as const },
      { id: 'c', publication_state: 'RESTRICTED' as const },
      { id: 'd', publication_state: null },
    ];
    expect(publiclyReadableOnly(rows).map((r) => r.id)).toEqual(['a', 'd']);
  });

  it('the SQL filter treats legacy NULL exactly like the existing is_hidden pattern', () => {
    expect(PUBLISHABLE_FILTER).toBe(
      'publication_state.is.null,publication_state.eq.PUBLISHED',
    );
  });
});

// ---------------------------------------------------------------------------
// Client bypass
// ---------------------------------------------------------------------------

describe('a client cannot set its own publication state', () => {
  it('every lifecycle field is server-controlled', () => {
    for (const f of ['publication_state', 'safety_state', 'evaluated_version', 'evaluated_at'])
      expect(SERVER_CONTROLLED_FIELDS).toContain(f);
  });

  it('a forged body is detected, not silently sanitised', () => {
    expect(attemptsPublicationBypass({ body: 'hi', publication_state: 'PUBLISHED' })).toBe(true);
    expect(attemptsPublicationBypass({ body: 'hi' })).toBe(false);
  });

  it('server-controlled fields are stripped and reported', () => {
    const { cleaned, rejected } = stripServerControlledFields({
      body: 'hi',
      publication_state: 'PUBLISHED',
      safety_state: 'SAFE',
      evaluated_version: 'v9',
      hashtags: ['a'],
    });
    expect(cleaned).toEqual({ body: 'hi', hashtags: ['a'] });
    expect([...rejected].sort()).toEqual([
      'evaluated_version',
      'publication_state',
      'safety_state',
    ]);
  });

  it('an edit request cannot smuggle a state through either', () => {
    const { rejected } = stripServerControlledFields({
      body: 'edited caption',
      is_hidden: false,
      publication_state: 'PUBLISHED',
    });
    expect(rejected).toContain('publication_state');
    expect(rejected).toContain('is_hidden');
  });
});

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

describe('an edit invalidates the previous decision', () => {
  it('V1 authorisation never carries to V2', () => {
    const published = { publication_state: 'PUBLISHED' as const, evaluated_version: 'v1' };
    expect(effectivePublicationState(published, 'v1')).toBe('PUBLISHED');
    expect(effectivePublicationState(published, 'v2')).toBe('UNDER_REVIEW');
  });

  it('a stale RESTRICTED also returns to review — staleness cuts both ways', () => {
    const restricted = { publication_state: 'RESTRICTED' as const, evaluated_version: 'v1' };
    expect(effectivePublicationState(restricted, 'v1')).toBe('RESTRICTED');
    expect(effectivePublicationState(restricted, 'v2')).toBe('UNDER_REVIEW');
  });

  it('legacy rows keep legacy treatment — the gate does not seize old content', () => {
    expect(effectivePublicationState({}, 'v1')).toBe('LEGACY');
    expect(effectivePublicationState({ publication_state: null, evaluated_version: null }, 'v1')).toBe(
      'LEGACY',
    );
  });

  it('a decision with no fingerprint cannot publish', () => {
    expect(
      effectivePublicationState({ publication_state: 'PUBLISHED', evaluated_version: null }, 'v1'),
    ).toBe('UNDER_REVIEW');
  });

  it('an unrecognised stored state falls back to review, never to published', () => {
    expect(
      effectivePublicationState(
        { publication_state: 'APPROVED' as unknown as StoredPublicationState, evaluated_version: 'v1' },
        'v1',
      ),
    ).toBe('UNDER_REVIEW');
  });
});

// ---------------------------------------------------------------------------
// Every public route honours the gate
// ---------------------------------------------------------------------------

describe('server-side enforcement across every public surface', () => {
  /**
   * Routes that return review content to a caller who may be anyone.
   *
   * `mine` is deliberately absent: it is the author's own management surface,
   * and hiding a held post from its own author would strand it — invisible to
   * the one person who can edit or delete it.
   */
  const PUBLIC_REVIEW_ROUTES = [
    'app/api/reviews/feed/route.ts',
    'app/api/reviews/route.ts',
    'app/api/reviews/saved/route.ts',
    'app/api/recommendations/route.ts',
  ];

  for (const route of PUBLIC_REVIEW_ROUTES) {
    it(`${route} APPLIES the publication filter to its query`, () => {
      const source = readFileSync(path.join(SRC, route), 'utf8');
      // ⚠ Checking that the name merely APPEARS in the file is decorative: the
      // import line alone satisfies it, so deleting every `.or(PUBLISHABLE_FILTER)`
      // call would still pass. Mutation testing caught exactly that. The
      // assertion below requires the filter to be applied to a query.
      const applied =
        /\.or\(\s*publishableFilter\(\)\s*\)/.test(source) ||
        /publiclyReadableOnly\s*\(/.test(source) ||
        /isPubliclyReadable\s*\(/.test(source);
      expect(applied, `${route} must APPLY the publication gate, not merely import it`).toBe(true);
    });
  }

  it('the Explore route applies the gate to BOTH of its query paths', () => {
    // Trending and latest are separate queries; guarding one and not the other
    // would leave a whole sort mode unfiltered.
    const feed = readFileSync(path.join(SRC, 'app/api/reviews/feed/route.ts'), 'utf8');
    const applications = feed.match(/\.or\(\s*publishableFilter\(\)\s*\)/g) ?? [];
    expect(applications.length).toBeGreaterThanOrEqual(2);
  });

  it('the filter is INERT until the migration is applied — deploy order cannot break the feed', () => {
    // PostgREST errors on a filter naming a column the table lacks. Shipping the
    // real filter before the migration would take every feed down while the gate
    // was still switched off.
    expect(publishableFilter({})).toBe('id.not.is.null');
    expect(publishableFilter({ CONTENT_SAFETY_SCHEMA_MIGRATED: 'false' })).toBe('id.not.is.null');
    expect(publishableFilter({ CONTENT_SAFETY_SCHEMA_MIGRATED: 'true' })).toBe(PUBLISHABLE_FILTER);
  });

  it('the inert filter really is a tautology, not a silent exclusion', () => {
    // If it excluded anything, the "safe" window would quietly hide content.
    expect(publishableFilter({})).toContain('id.not.is.null');
    expect(publishableFilter({})).not.toContain('publication_state');
  });

  it('the mutation route refuses a forged publication state', () => {
    // `[id]` serves no content — it deletes and it hides. What it must guard is
    // the other direction: a client writing its own lifecycle state.
    //
    // ⚠ Asserting the function NAME appears is decorative — `if (false) {` left
    // the name in place and the guard dead, and survived. The check below
    // requires the call to actually BE the condition, and the branch to refuse.
    const source = readFileSync(path.join(SRC, 'app/api/reviews/[id]/route.ts'), 'utf8');
    expect(source).toMatch(/if\s*\(\s*attemptsPublicationBypass\([^)]*\)\s*\)\s*\{/);
    expect(source).toMatch(
      /if\s*\(\s*attemptsPublicationBypass\([^)]*\)\s*\)\s*\{[\s\S]{0,200}?status:\s*400/,
    );
  });

  it('the author-facing surface is NOT filtered — a held post must stay reachable by its author', () => {
    const mine = readFileSync(path.join(SRC, 'app/api/reviews/mine/route.ts'), 'utf8');
    expect(mine).not.toContain('PUBLISHABLE_FILTER');
  });
});

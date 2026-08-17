import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  POLICY_REGISTRY,
  REGISTRY_RATIFIABLE_COUNT,
  REGISTRY_RECORD_COUNT,
  REGISTRY_SOURCE_HASH,
} from '../source/registry';
import {
  DuplicatePolicyError,
  RegistryPolicyProvider,
  defaultPolicyProvider,
  parsePolicyRef,
} from '../provider';
import { getProtectedTargetSet, isProtectedTargetSetBlocked } from '../legal/protectedTargets';
import {
  EVIDENCE_SENSITIVITY_MARKERS,
  SC1_FIELDS,
  canBeCitedInDecision,
  isRatifiable,
  openFields,
  type PolicyRecord,
} from '../types';

// ---------------------------------------------------------------------------
// Independent re-parse of the corpus.
//
// The registry is generated FROM the corpus; these tests re-derive FROM the
// corpus and compare. Nothing is hardcoded twice, so the test fails if the
// corpus changes and the registry is not regenerated.
// ---------------------------------------------------------------------------

const TAXONOMY = path.resolve(
  __dirname,
  '../../../../docs/policy/02_POLICY_TAXONOMY.md',
);

interface ParsedRecord {
  identity: string;
  decls: Record<string, { status: 'DECLARED' | 'OPEN'; raw: string }>;
  /** Corpus text after the last declaration that is not itself a declaration. */
  trailingNote?: string;
}

/** The last SC-1 field; a trailing note glues itself to this one when split naively. */
const LAST_SC1_FIELD = SC1_FIELDS[SC1_FIELDS.length - 1];

function parseCorpus(): ParsedRecord[] {
  const text = readFileSync(TAXONOMY, 'utf8');
  const out: ParsedRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('Conformance (SC-1)')) continue;
    const start = line.indexOf('Conformance (SC-1)');
    const body = line
      .slice(start + 'Conformance (SC-1)'.length)
      .replace(/^\*\*\s*/, '')
      .replace(/^\s*[—-]\s*/, '');
    const decls: ParsedRecord['decls'] = {};
    for (const part of body.split(/ · (?=`[a-z_]+`)/)) {
      const m = part.match(/^`([a-z_]+)`\s*(✅|🔶)\s*([\s\S]*)$/);
      if (!m) continue;
      decls[m[1]] = { status: m[2] === '✅' ? 'DECLARED' : 'OPEN', raw: m[3].trim() };
    }
    // The ` · (?=\`field\`)` lookahead leaves a trailing note attached to the
    // LAST declaration. Separate it here exactly as the generator does, or this
    // parser asserts that #13's `relationships` value contains a
    // PROTECTED_TARGET_SET note — which is the bug, not the expectation.
    let trailingNote: string | undefined;
    const lastRaw = decls[LAST_SC1_FIELD]?.raw ?? '';
    const cut = lastRaw.indexOf(' · ');
    if (cut !== -1) {
      trailingNote = lastRaw.slice(cut + 3).trim();
      decls[LAST_SC1_FIELD].raw = lastRaw.slice(0, cut).trim();
    }
    out.push({ identity: (decls.identity?.raw ?? '').replace(/`/g, '').trim(), decls, trailingNote });
  }
  return out;
}

const corpus = parseCorpus();

const LEGAL_POLICY = 'ts.hate.protected-target-abuse';
// RE-PINNED 2026-08-16: `decisive_dimensions` was populated under Owner
// authority — it declares WHICH §6.1 dimensions decide, never which
// characteristics qualify — so it is no longer a Legal-open field. The
// boundary narrowed to one field; the assertions below got STRICTER, not
// looser: the field is now positively asserted DECLARED, and a separate test
// asserts no protected characteristic was smuggled into its value.
const LEGAL_OPEN_FIELDS = ['severity_envelope'];
const LEGAL_BLOCKED_BY = 'G02-D-07b';

function recordOf(identity: string): PolicyRecord {
  const found = POLICY_REGISTRY.find((r) => r.identity === identity);
  if (!found) throw new Error(`registry missing ${identity}`);
  return found;
}

// ---------------------------------------------------------------------------
// Corpus regression
// ---------------------------------------------------------------------------

describe('registry corresponds to the SC-1 corpus', () => {
  it('the corpus itself still yields 18 records', () => {
    expect(corpus).toHaveLength(18);
  });

  it('the registry has the same record count as the corpus', () => {
    expect(POLICY_REGISTRY).toHaveLength(corpus.length);
    expect(REGISTRY_RECORD_COUNT).toBe(corpus.length);
  });

  it('every corpus identity is present in the registry, and nothing extra is', () => {
    expect([...POLICY_REGISTRY.map((r) => r.identity)].sort()).toEqual(
      [...corpus.map((r) => r.identity)].sort(),
    );
  });

  it('every record carries all 13 declarations', () => {
    for (const record of POLICY_REGISTRY) {
      for (const field of SC1_FIELDS) {
        if (field === 'identity') {
          expect(record.identity).toBeTruthy();
          continue;
        }
        const decl = record[field as Exclude<(typeof SC1_FIELDS)[number], 'identity'>];
        expect(decl, `${record.identity}.${field}`).toBeDefined();
        expect(['DECLARED', 'OPEN']).toContain(decl.status);
      }
    }
  });

  it('preserves every declaration verbatim from the corpus', () => {
    for (const parsed of corpus) {
      const record = recordOf(parsed.identity);
      for (const field of SC1_FIELDS) {
        if (field === 'identity') continue;
        const decl = record[field as Exclude<(typeof SC1_FIELDS)[number], 'identity'>];
        expect(decl.raw, `${parsed.identity}.${field} raw`).toBe(parsed.decls[field].raw);
        expect(decl.status, `${parsed.identity}.${field} status`).toBe(parsed.decls[field].status);
      }
    }
  });

  it('17/18 are ratifiable', () => {
    expect(POLICY_REGISTRY.filter(isRatifiable)).toHaveLength(17);
    expect(REGISTRY_RATIFIABLE_COUNT).toBe(17);
  });

  it('#13 is the only non-ratifiable record', () => {
    const nonRatifiable = POLICY_REGISTRY.filter((r) => !isRatifiable(r)).map((r) => r.identity);
    expect(nonRatifiable).toEqual([LEGAL_POLICY]);
  });

  it('records the source hash it was generated from', () => {
    expect(REGISTRY_SOURCE_HASH).toMatch(/^[0-9a-f]{8}$/);
    for (const record of POLICY_REGISTRY) {
      expect(record.provenance?.sourceHash).toBe(REGISTRY_SOURCE_HASH);
    }
  });

  it('no record was fabricated — every identity matches ts.<family>.<policy>', () => {
    for (const record of POLICY_REGISTRY) {
      expect(record.identity).toMatch(/^ts\.[a-z0-9-]+\.[a-z0-9-]+$/);
    }
  });

  it('preserves the three-marker child-safety evidence declaration', () => {
    // The distinction an earlier {base, restrictedHandling} model would have lost.
    const child = recordOf('ts.child.sexual-exploitation');
    expect(child.evidence_sensitivity.value).toEqual({
      markers: ['LEGALLY_SENSITIVE', 'RESTRICTED_HANDLING', 'HUMAN_REQUIRED'],
    });
  });

  it('uses only markers from the closed evidence vocabulary', () => {
    for (const record of POLICY_REGISTRY) {
      const value = record.evidence_sensitivity.value as { markers?: string[] } | null;
      for (const marker of value?.markers ?? []) {
        expect(EVIDENCE_SENSITIVITY_MARKERS).toContain(marker);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

describe('provenance', () => {
  it('every record cites file, hash, line and generation date', () => {
    for (const record of POLICY_REGISTRY) {
      expect(record.provenance?.sourceFile).toBe('docs/policy/02_POLICY_TAXONOMY.md');
      expect(record.provenance?.sourceLine).toBeGreaterThan(0);
      expect(record.provenance?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('source lines are distinct — one record per corpus line', () => {
    const lines = POLICY_REGISTRY.map((r) => r.provenance?.sourceLine);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

// ---------------------------------------------------------------------------
// #13 Legal boundary
// ---------------------------------------------------------------------------

describe('#13 Legal boundary is preserved by the registry', () => {
  it('keeps exactly one Legal field OPEN', () => {
    expect(openFields(recordOf(LEGAL_POLICY)).sort()).toEqual([...LEGAL_OPEN_FIELDS].sort());
  });

  it('attributes it to G02-D-07b and supplies no value', () => {
    const record = recordOf(LEGAL_POLICY);
    for (const field of LEGAL_OPEN_FIELDS) {
      const decl = record[field as 'severity_envelope'];
      expect(decl.status).toBe('OPEN');
      expect(decl.value).toBeNull();
      expect(decl.blockedBy).toBe(LEGAL_BLOCKED_BY);
    }
  });

  it('keeps the trailing PROTECTED_TARGET_SET note OUT of the relationships value', () => {
    const record = recordOf(LEGAL_POLICY);
    expect(record.relationships.raw).not.toMatch(/PROTECTED_TARGET_SET/);
    expect(record.trailingNote).toMatch(/PROTECTED_TARGET_SET/);
    expect(record.trailingNote).toMatch(LEGAL_BLOCKED_BY);
    // and no other record carries one
    for (const r of POLICY_REGISTRY.filter((x) => x.identity !== LEGAL_POLICY)) {
      expect(r.trailingNote, r.identity).toBeUndefined();
    }
  });

  it('declares decisive_dimensions without naming any protected characteristic', () => {
    const decl = recordOf(LEGAL_POLICY).decisive_dimensions;
    expect(decl.status).toBe('DECLARED');
    // The declaration names §6.1 dimensions, not membership. Anything that looks
    // like an enumerated set would be G02-D-07b being answered in code.
    expect(decl.raw).toMatch(/Actor & target/);
    expect(decl.raw).toMatch(/Purpose/);
    expect(decl.raw).not.toMatch(/PROTECTED_TARGET_SET\s*=\s*\[/);
  });

  it('still reports the protected target set as BLOCKED at runtime', () => {
    // The narrowed corpus boundary must not have widened the runtime one.
    expect(isProtectedTargetSetBlocked()).toBe(true);
    expect(getProtectedTargetSet()).toMatchObject({ state: 'BLOCKED', blockedBy: LEGAL_BLOCKED_BY });
  });

  it('its other 11 declarations are unaffected', () => {
    const record = recordOf(LEGAL_POLICY);
    const stillDeclared = SC1_FIELDS.filter(
      (f) => f !== 'identity' && !LEGAL_OPEN_FIELDS.includes(f),
    );
    for (const field of stillDeclared) {
      const decl = record[field as Exclude<(typeof SC1_FIELDS)[number], 'identity'>];
      expect(decl.status, field).toBe('DECLARED');
    }
  });
});

// ---------------------------------------------------------------------------
// VER-1 — the citation precondition
// ---------------------------------------------------------------------------

describe('VER-1 citation precondition', () => {
  it('no record carries an effective-from, because SC-1 declares none', () => {
    for (const record of POLICY_REGISTRY) {
      expect(record.lifecycle.effectiveFrom).toBeNull();
    }
  });

  it('therefore no record currently satisfies VER-1 for decision citation', () => {
    expect(POLICY_REGISTRY.filter(canBeCitedInDecision)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Provider — lifecycle
// ---------------------------------------------------------------------------

const T2026 = '2026-08-16T00:00:00.000Z';

function withLifecycle(
  base: PolicyRecord,
  lifecycle: Partial<PolicyRecord['lifecycle']>,
): PolicyRecord {
  return { ...base, lifecycle: { ...base.lifecycle, ...lifecycle } };
}

describe('PolicyProvider lifecycle filtering (PRECEDENT §2.1)', () => {
  it('classifies every current record as undetermined, not active', () => {
    const result = defaultPolicyProvider.getActive(T2026);
    expect(result.undetermined).toHaveLength(18);
    expect(result.active).toHaveLength(0);
    expect(result.asOf).toBe(T2026);
  });

  it('returns an active policy once it has a window that contains asOf', () => {
    const provider = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), { effectiveFrom: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(provider.getActive(T2026).active).toHaveLength(1);
  });

  it('does not activate a future policy before its effective date', () => {
    const provider = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), { effectiveFrom: '2027-01-01T00:00:00.000Z' }),
    ]);
    const result = provider.getActive(T2026);
    expect(result.active).toHaveLength(0);
    expect(result.outOfWindow).toHaveLength(1);
  });

  it('does not return a policy whose effective-to has passed', () => {
    const provider = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), {
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: '2026-06-01T00:00:00.000Z',
      }),
    ]);
    const result = provider.getActive(T2026);
    expect(result.active).toHaveLength(0);
    expect(result.outOfWindow).toHaveLength(1);
  });

  it('treats effective-from as inclusive and effective-to as exclusive', () => {
    const boundary = '2026-08-16T00:00:00.000Z';
    const atStart = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), { effectiveFrom: boundary }),
    ]);
    expect(atStart.getActive(boundary).active).toHaveLength(1);

    const atEnd = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), {
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: boundary,
      }),
    ]);
    expect(atEnd.getActive(boundary).active).toHaveLength(0);
  });

  it('excludes a disabled policy and reports it separately', () => {
    const provider = new RegistryPolicyProvider([
      withLifecycle(recordOf('ts.animal.cruelty'), {
        enabled: false,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      }),
    ]);
    const result = provider.getActive(T2026);
    expect(result.active).toHaveLength(0);
    expect(result.disabled).toHaveLength(1);
  });

  it('never silently drops a record — the four buckets always total the registry', () => {
    const r = defaultPolicyProvider.getActive(T2026);
    expect(
      r.active.length + r.undetermined.length + r.disabled.length + r.outOfWindow.length,
    ).toBe(POLICY_REGISTRY.length);
  });

  it('is deterministic — no dependence on the current clock', () => {
    const a = defaultPolicyProvider.getActive(T2026);
    const b = defaultPolicyProvider.getActive(T2026);
    expect(a.active.map((r) => r.identity)).toEqual(b.active.map((r) => r.identity));
    expect(a.undetermined.map((r) => r.identity)).toEqual(b.undetermined.map((r) => r.identity));
  });
});

// ---------------------------------------------------------------------------
// Provider — exact lookup
// ---------------------------------------------------------------------------

describe('PolicyProvider exact id@version lookup', () => {
  it('resolves an exact reference', () => {
    const result = defaultPolicyProvider.getById('ts.animal.cruelty@1');
    expect(result.state).toBe('FOUND');
    if (result.state === 'FOUND') expect(result.record.identity).toBe('ts.animal.cruelty');
  });

  it('reports an unknown policy distinctly', () => {
    const result = defaultPolicyProvider.getById('ts.nope.missing@1');
    expect(result.state).toBe('UNKNOWN_POLICY');
  });

  it('reports an unknown version distinctly, and lists what does exist', () => {
    const result = defaultPolicyProvider.getById('ts.animal.cruelty@99');
    expect(result.state).toBe('UNKNOWN_VERSION');
    if (result.state === 'UNKNOWN_VERSION') {
      expect(result.requestedVersion).toBe('@99');
      expect(result.availableVersions).toContain('@1');
    }
  });

  it('refuses to guess a version when none is supplied', () => {
    const result = defaultPolicyProvider.getById('ts.animal.cruelty');
    expect(result.state).toBe('UNKNOWN_VERSION');
    if (result.state === 'UNKNOWN_VERSION') {
      expect(result.requestedVersion).toBe('(none supplied)');
    }
  });

  it('rejects a malformed reference', () => {
    expect(defaultPolicyProvider.getById('not-a-policy').state).toBe('MALFORMED_REFERENCE');
    expect(defaultPolicyProvider.getById('').state).toBe('MALFORMED_REFERENCE');
  });

  it('parses references without resolving them', () => {
    expect(parsePolicyRef('ts.animal.cruelty@2')).toEqual({
      identity: 'ts.animal.cruelty',
      version: '@2',
    });
    expect(parsePolicyRef('ts.animal.cruelty')).toEqual({
      identity: 'ts.animal.cruelty',
      version: null,
    });
    expect(parsePolicyRef('garbage')).toBeNull();
  });

  it('returns the record for the Legal-blocked policy so a past decision stays explainable', () => {
    const result = defaultPolicyProvider.getById(`${LEGAL_POLICY}@1`);
    expect(result.state).toBe('FOUND');
    if (result.state === 'FOUND') expect(isRatifiable(result.record)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider — integrity
// ---------------------------------------------------------------------------

describe('PolicyProvider integrity', () => {
  it('rejects a duplicate id@version at construction', () => {
    const one = recordOf('ts.animal.cruelty');
    expect(() => new RegistryPolicyProvider([one, one])).toThrow(DuplicatePolicyError);
  });

  it('exposes every record regardless of lifecycle state', () => {
    expect(defaultPolicyProvider.getAll()).toHaveLength(18);
  });

  it('reports the ratifiable count without evaluating anything', () => {
    expect(defaultPolicyProvider.ratifiableCount()).toBe(17);
  });
});

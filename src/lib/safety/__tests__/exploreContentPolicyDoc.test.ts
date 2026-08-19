/**
 * The Explore Content Policy is a promise to users. This pins it to the code.
 *
 * A policy document that drifts from the implementation is worse than none: it
 * describes protections that are not there. These tests fail when the document
 * and the engine disagree, in either direction — a policy added to the engine
 * and not the document, or claimed in the document and absent from the engine.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PUBLICATION_GATE_RULES } from '../gate/publicationGate';
import { PUBLICATION_STATES, SAFETY_STATES } from '../gate/safetyResult';
import { SUPPORTED_MODALITIES, UNSUPPORTED_MODALITIES } from '../evidence/modalities';

const DOC = readFileSync('docs/policy/EXPLORE_CONTENT_POLICY.md', 'utf8');

/** Identities anywhere in the prose, however they are marked up. */
function policyIdentitiesIn(text: string): Set<string> {
  return new Set(text.match(/ts\.[a-z]+\.[a-z-]+/g) ?? []);
}

describe('Explore Content Policy document', () => {
  it('names every policy the engine gates on, and invents none', () => {
    const inEngine = new Set(Object.keys(PUBLICATION_GATE_RULES));
    const inDoc = policyIdentitiesIn(DOC);

    for (const p of inEngine) expect(inDoc, `missing from the document: ${p}`).toContain(p);
    for (const p of inDoc) expect(inEngine, `document invents: ${p}`).toContain(p);
  });

  it('records the one policy that does not gate publication, and why it is not a resolution', () => {
    const nonBlocking = Object.entries(PUBLICATION_GATE_RULES)
      .filter(([, rule]) => rule === 'DOES_NOT_BLOCK_PUBLICATION')
      .map(([p]) => p);
    expect(nonBlocking).toEqual(['ts.hate.protected-target-abuse']);
    // It must be disclosed as an exception rather than listed silently as prohibited.
    expect(DOC).toMatch(/not a legal ratification/i);
  });

  it('states every publication and safety state the code can produce', () => {
    for (const s of PUBLICATION_STATES) expect(DOC, s).toContain(s);
    for (const s of SAFETY_STATES) expect(DOC, s).toContain(s);
  });

  it('the coverage table matches what the pipeline actually runs', () => {
    // The honesty claim of §6. If a modality becomes available, the document
    // must stop saying it is not examined.
    expect([...SUPPORTED_MODALITIES]).toEqual(['TEXT', 'METADATA', 'IMAGE_FRAME']);
    expect([...UNSUPPORTED_MODALITIES]).toEqual(['VIDEO_FRAMES', 'AUDIO_SPEECH']);
    expect(DOC).toMatch(/video frames across the clip\*\*\s*\|\s*❌/i);
    expect(DOC).toMatch(/audio \/ speech \/ transcript\*\*\s*\|\s*❌/i);
  });

  /**
   * The claims most likely to become false by accident, and the most damaging
   * if they do — a product must never tell users a protection exists when it
   * does not.
   */
  it('claims no human review, no appeal, and no third-party moderation vendor', () => {
    expect(DOC).toMatch(/There are no reviewers/i);
    expect(DOC).toMatch(/no appeal/i);
    // No vendor may be named as an integrated moderation provider.
    expect(DOC).toMatch(/does \*\*not\*\* use Facebook/i);
  });

  it('does not describe holding content as an enforcement action', () => {
    // RESTRICTED means "was never published". Calling it a takedown would
    // misdescribe what happened and imply an appeal right that does not exist.
    expect(DOC).toMatch(/never published|was never published/i);
    for (const word of ['shadowban', 'shadow ban', 'account suspension'])
      expect(DOC.toLowerCase(), word).not.toContain(word);
  });

  it('discloses that the gate currently publishes nothing', () => {
    // The single most consequential operational fact. If it stops being true,
    // this assertion should be the thing that makes someone update the document.
    expect(DOC).toMatch(/no new Explore post reaches `PUBLISHED`/i);
  });
});

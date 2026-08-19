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
/** The same text with runs of whitespace collapsed, so a hard-wrapped sentence
 *  can still be matched as one phrase. */
const FLAT = DOC.replace(/\s+/g, ' ');

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

  it('records every policy that does not gate publication, and why', () => {
    const nonBlocking = Object.entries(PUBLICATION_GATE_RULES)
      .filter(([, rule]) => rule === 'DOES_NOT_BLOCK_PUBLICATION')
      .map(([p]) => p)
      .sort();
    expect(nonBlocking).toEqual([
      'ts.graphic.presentation',
      'ts.hate.protected-target-abuse',
      'ts.sexual.adult-content',
    ]);
    // Each must be disclosed as an exception rather than listed silently as prohibited.
    expect(DOC).toMatch(/not a legal ratification/i);
    expect(DOC).toMatch(/RESTRICTED/);
    // And the document must say plainly what the exception is NOT.
    expect(DOC).toMatch(/does not mean sexual content|not a general permission/i);
  });

  /** The claim a reader is most likely to be misled by, if the doc drifts. */
  it('states that child-safety and non-consent policies still block', () => {
    for (const p of ['ts.child.sexual-exploitation', 'ts.sexual.exploitation-nonconsent'])
      expect(DOC).toContain(p);
    expect(DOC).toMatch(/still block|remain(s)? prohibited|continue to block/i);
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

  it('discloses that video is held, which is now the consequential limitation', () => {
    // The previous version of this assertion pinned "no post reaches PUBLISHED".
    // That stopped being true when the RESTRICTED decision landed, and this guard
    // is what forced the document to be updated rather than silently drift.
    //
    // The load-bearing fact is now narrower: photos and text publish, video does
    // not, because most of a video is never examined. If frame sampling ever
    // lands, this assertion is what makes someone correct the document.
    expect(DOC).toMatch(/videos are held/i);
    expect(DOC).toMatch(/benign photo or text post now publishes/i);
  });
});

/**
 * The MVP contract, as a user would read it. These are the promises the product
 * now makes, and the ones most damaging to break silently.
 */
describe('Explore Content Policy — the MVP contract', () => {
  it('promises that every upload resolves, and describes both outcomes', () => {
    expect(DOC).toMatch(/Every upload resolves/i);
    expect(DOC).toMatch(/PUBLISHED/);
    expect(DOC).toMatch(/RESTRICTED/);
  });

  it('promises a rejected post is kept, visible to its author, and marked', () => {
    expect(DOC).toMatch(/not deleted|does not disappear/i);
    expect(DOC).toMatch(/stays in your profile/i);
    expect(DOC).toMatch(/Community Guidelines/);
  });

  it('separates a finding from an unfinished check, and never conflates them', () => {
    // Whitespace-normalised: the document is hard-wrapped, so a sentence this
    // long spans lines and a raw substring match would silently never fire.
    expect(FLAT).toMatch(/not a finding that you did anything wrong/i);
    expect(FLAT).toMatch(/unfinished check/i);
    expect(FLAT).toMatch(/could not confirm/i);
  });

  it('says plainly that nothing unverified publishes', () => {
    expect(DOC).toMatch(/cannot be positively established as safe/i);
    expect(DOC).toMatch(/fail-closed/i);
  });

  it('does not promise human review or an appeal it does not have', () => {
    expect(DOC).toMatch(/no appeal/i);
    expect(DOC).toMatch(/There are no reviewers/i);
    expect(DOC).toMatch(/does not exist today/i);
  });
});

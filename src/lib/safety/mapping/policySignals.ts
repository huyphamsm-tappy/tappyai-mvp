/**
 * Evidence → policy signals.
 *
 * ============================================================================
 * THE RULE THIS FILE ENFORCES
 * ============================================================================
 * An observation is not a conclusion. The pipeline can report that a frame shows
 * a knife, or that a caption contains a phone number. Whether either constitutes
 * a policy is decided by the corpus, and for almost every policy the corpus says
 * the constitutive element is a matter of **purpose, intent or context** — which
 * no observation establishes.
 *
 * So this file does two things, and the second matters more than the first:
 *
 *   1. it maps the few observations that DO establish a corpus element;
 *   2. it declares, per policy, that nothing observable establishes the rest.
 *
 * The declaration is exported data, not a comment, so a test can assert it and a
 * future contributor has to edit it deliberately rather than drift into it.
 *
 * 🚨 TOP-1 IS THE LAW HERE: a topic can never constitute a policy. "blood",
 * "knife", "animal", "nudity" are topics. They may narrow which policies are
 * worth evaluating; they may never establish one. Every descriptor the vision
 * modality returns is a topic.
 */

import type { Signals } from '@/lib/policy/detect/constitution';

import { absenceSignalFor, examinationOf } from './applicability';

import {
  allContactIdentifiers,
  observationsIn,
  type EvidenceBundle,
} from '../evidence/types';

// ---------------------------------------------------------------------------
// What no observation can establish
// ---------------------------------------------------------------------------

/**
 * For each policy, the constitutive element and whether anything the pipeline can
 * observe establishes it.
 *
 * `establishedByObservation: false` is the honest state of seventeen of the
 * eighteen. It is not a TODO — it is a statement that the corpus's element is a
 * judgement, and that the correct machine answer is therefore `UNDETERMINED`.
 */
export interface PolicyObservability {
  readonly policy: string;
  /** The corpus element, in short. */
  readonly decisiveElement: string;
  readonly establishedByObservation: boolean;
  /** Why, in one line. */
  readonly note: string;
}

const NOT_OBSERVABLE = (policy: string, decisiveElement: string, note: string): PolicyObservability => ({
  policy,
  decisiveElement,
  establishedByObservation: false,
  note,
});

export const POLICY_OBSERVABILITY: readonly PolicyObservability[] = Object.freeze([
  {
    policy: 'ts.privacy.personal-information',
    decisiveElement: 'governed exposure of another person, without established consent',
    establishedByObservation: true,
    note: 'Contact identifiers are structural and readable from caption and on-screen text. Consent is NOT observable and stays absent — P1 therefore still answers UNDETERMINED on the positive path, exactly as its frozen semantics require.',
  },
  NOT_OBSERVABLE(
    'ts.violence.graphic-harm',
    'glorification or shock-primacy',
    'Whether a depiction glorifies is a judgement about purpose. Visible injury is a topic and TOP-1 forbids it constituting anything.',
  ),
  NOT_OBSERVABLE(
    'ts.danger.harmful-activity',
    'presented as encouragement to imitate',
    'Encouragement is intent. A dangerous act being visible establishes nothing.',
  ),
  NOT_OBSERVABLE(
    'ts.graphic.presentation',
    'NOT_VIEWER_INITIATED viewing of the assessed item',
    'A property of the presentation event, not of the media. The corpus forbids inferring it from content at all.',
  ),
  NOT_OBSERVABLE(
    'ts.sexual.adult-content',
    'absence of the required presentation conditions',
    'The required conditions are a product setting, not something visible in a frame. Explicitness is a topic.',
  ),
  NOT_OBSERVABLE(
    'ts.animal.cruelty',
    'gratuitousness relative to purpose',
    'The corpus states plainly that this requires human judgement, not a keyword. An animal being visible is a topic.',
  ),
  NOT_OBSERVABLE(
    'ts.child.sexual-exploitation',
    'sexual exploitation of a minor',
    'HUMAN_REQUIRED: the corpus forbids concluding a violation without human review, whatever any modality reports.',
  ),
  NOT_OBSERVABLE(
    'ts.child.sexualization',
    'sexualised presentation of a minor',
    'HUMAN_REQUIRED, as above.',
  ),
  NOT_OBSERVABLE(
    'ts.child.grooming',
    'patterned conduct to build exploitative trust',
    'Pattern-based across an interaction; a single item cannot show it. HUMAN_REQUIRED.',
  ),
  NOT_OBSERVABLE('ts.child.abuse-harm', 'abuse or endangerment of a minor', 'HUMAN_REQUIRED, as above.'),
  NOT_OBSERVABLE(
    'ts.selfharm.promotion',
    'promotion or instruction directed at others',
    'Direction is intent, and the corpus is explicit that treating disclosure as violation is itself a harm. HUMAN_REQUIRED.',
  ),
  NOT_OBSERVABLE(
    'ts.violence.incitement-threats',
    'credibility and an identifiable target, together',
    'Credibility is contextual. CORROBORATED besides.',
  ),
  NOT_OBSERVABLE(
    'ts.sexual.exploitation-nonconsent',
    'non-consensual sexual conduct',
    'Consent is not observable. CORROBORATED besides.',
  ),
  NOT_OBSERVABLE(
    'ts.harassment.targeted',
    'abuse directed at the person rather than their work',
    'The line between criticism and abuse is a judgement; on a review platform it is the whole question. CORROBORATED.',
  ),
  NOT_OBSERVABLE(
    'ts.deception.harmful',
    'four conjunctive elements including intent',
    'Intent is not observable. CORROBORATED.',
  ),
  NOT_OBSERVABLE(
    'ts.fraud.scam',
    'a deceptive scheme for gain',
    'Requires establishing deception and purpose. CORROBORATED.',
  ),
  NOT_OBSERVABLE(
    'ts.platform.abuse-manipulation',
    'coordinated inauthentic behaviour',
    'A property of behaviour across accounts, not of one item. CORROBORATED.',
  ),
  NOT_OBSERVABLE(
    'ts.hate.protected-target-abuse',
    'blocked',
    'LEGAL_BLOCKED on G02-D-07b. No protected-target set exists and none is invented.',
  ),
]);

/** The one policy any observation currently feeds. */
export const OBSERVABLE_POLICIES: readonly string[] = POLICY_OBSERVABILITY.filter(
  (p) => p.establishedByObservation,
).map((p) => p.policy);

// ---------------------------------------------------------------------------
// P1 — the mapping that exists
// ---------------------------------------------------------------------------

/** Contact strings the metadata says belong to the business the post is about. */
export function businessContactsIn(bundle: EvidenceBundle): readonly string[] {
  const prefix = 'businessContact:';
  return observationsIn(bundle)
    .flatMap((o) => o.descriptors ?? [])
    .filter((d) => d.startsWith(prefix))
    .map((d) => d.slice(prefix.length));
}

/**
 * P1 signals derived from evidence.
 *
 * What this establishes:
 *   · identifying information is present, when any modality read a contact string
 *   · the business carve-out, when a read string is the post's own place contact
 *
 * What it deliberately never establishes:
 *   · **consent** — nothing observable bears on it, so the field stays absent and
 *     P1 keeps answering UNDETERMINED on the positive path. P1's semantics are
 *     frozen and this pipeline does not touch them.
 *   · **absence** of identifying information — reading no contact string is not
 *     the same as establishing there is none, so `false` is never written.
 *
 * 🔑 Caption and media are UNIONED, not ranked. A number burned into a frame
 * counts even if the caption is empty, and an empty frame never cancels a number
 * in the caption. Neither source overrides the other, because both are reading
 * the same structural fact rather than forming competing judgements.
 */
export function privacySignalsFrom(bundle: EvidenceBundle): Signals {
  const identifiers = allContactIdentifiers(bundle);
  const businessContacts = new Set(businessContactsIn(bundle));

  if (identifiers.length === 0) {
    // Reading no contact string is not, on its own, establishing there is none —
    // which is why this used to return `{}`. But when the examination was
    // COMPLETE, every surface that could carry an identifier was actually read,
    // and absence IS established. P1 anticipates exactly this: "a caller with
    // stronger evidence may supply `false` directly", and
    // `exposureConstitutedFrom` settles on it at step 2.
    //
    // 🔒 This touches only the absence path. P1's frozen consent semantics —
    // clauses 2 and 3, the branch that keeps the accepted result at 6/8 — are
    // reached only when identifying information IS present, and are untouched.
    return examinationOf(bundle).level === 'COMPLETE'
      ? { identifyingInformationPresent: false }
      : {};
  }

  const everyIdentifierIsBusiness = identifiers.every((id) =>
    [...businessContacts].some((b) => b.includes(id) || id.includes(b)),
  );

  return {
    identifyingInformationPresent: true,
    ...(everyIdentifierIsBusiness ? { subjectIsBusinessContact: true } : {}),
  };
}

/**
 * Signals for any policy, from evidence.
 *
 * Two kinds of answer come out of here, and they are not symmetric:
 *
 *   · P1 gets positive signals — the one place an observation establishes a
 *     corpus element (identifiers are structural; consent still never is).
 *   · Every other policy may get `{ [decisive]: false }` from
 *     {@link absenceSignalFor}, and ONLY when the item was completely examined
 *     and nothing observed raises that policy.
 *
 * Everything else still returns `{}` — "nothing established" — and the engine
 * still answers `UNDETERMINED`. What changed is that "we looked properly and
 * this policy is not in play" is now expressible, where before the only two
 * expressible answers were "violated" and "unknown".
 *
 * 🚨 Nothing in the absence path can produce `true`. It can move a policy from
 * blocking-unknown to not-applicable and can never move one toward a violation.
 */
export function signalsFor(policy: string, bundle: EvidenceBundle): Signals {
  if (policy === 'ts.privacy.personal-information') return privacySignalsFrom(bundle);
  return absenceSignalFor(policy, bundle);
}

/**
 * PRODUCT UAT MATRIX — classification only.
 *
 * ============================================================================
 * WHAT THIS IS
 * ============================================================================
 * A traceable statement of what the corpus says should happen, for the 17
 * ratifiable policies. Every scenario carries a VERBATIM quote from
 * `docs/policy/02_POLICY_TAXONOMY.md`, and the audit test asserts that quote
 * really occurs there. A scenario whose evidence cannot be found is a failing
 * test, not a footnote — that is what makes this a matrix rather than an
 * opinion.
 *
 * ============================================================================
 * WHAT THIS IS NOT
 * ============================================================================
 * - Not policy content. No new semantics, no new outcome class, no predicate.
 * - Not detection. `harness` below is a THREE-VALUED STAND-IN for "was the
 *   constitutive behavior established?", supplied the way a caller would supply
 *   it. It is not a detection rule and must never be read as one; per-policy
 *   predicates are Product content that does not exist in the corpus.
 * - Not enforcement. Every scenario's `enforcement` is `NONE / NOT TESTED`,
 *   permanently. Group 06 and Group 09 are not open.
 *
 * `expected: 'NOT_ESTABLISHED'` means the corpus does not determine an outcome
 * class for that situation. It is recorded as a gap, never guessed.
 */

import type { OutcomeClass } from '../types';

export type ScenarioKind = 'POSITIVE' | 'FALSE_POSITIVE' | 'AMBIGUOUS';

/** Three-valued stand-in for the caller-supplied predicate result. NOT detection. */
export type HarnessTruth = 'TRUE' | 'FALSE' | 'UNKNOWN';

export interface UatScenario {
  readonly id: string;
  readonly policy: string;
  readonly kind: ScenarioKind;
  /** The situation, in product language. */
  readonly situation: string;
  /** VERBATIM corpus text. The audit asserts this substring exists in the corpus file. */
  readonly evidence: string;
  /** Where that text lives, for a human reader. */
  readonly trace: string;
  /** Only classes the corpus/engine already establish, or NOT_ESTABLISHED. */
  readonly expected: OutcomeClass | 'NOT_ESTABLISHED';
  readonly why: string;
  /** Corpus-determined severity treatment, or the explicit absence of one. */
  readonly severityTreatment: string;
  readonly enforcement: 'NONE / NOT TESTED';
  /** How the harness presents this situation to the engine contract. */
  readonly harness: {
    readonly constitutive: HarnessTruth;
    readonly defeat?: HarnessTruth;
    readonly contextUnreadable?: boolean;
    readonly responseWarranted?: boolean;
  };
}

const NONE = 'NONE / NOT TESTED' as const;

/** Envelope wording reused where the corpus states a range and nothing more. */
const envelopeNote = (env: string) =>
  `Envelope ${env} bounds a case severity; it IS NOT one (ENV-1/ENV-2) and authorises nothing (ENV-3).`;
const noEnvelope =
  'NO_ENVELOPE (ENV-7): severity is not meaningful at taxonomy level for a RESTRICTED policy.';

export const UAT_MATRIX: readonly UatScenario[] = Object.freeze([
  // ── D1 · ts.violence.graphic-harm ─────────────────────────────────────────
  {
    id: 'UAT-VGH-1', policy: 'ts.violence.graphic-harm', kind: 'POSITIVE',
    situation: 'A clip of a beating, edited with celebratory music and captions praising the attacker.',
    evidence: 'glorifies, celebrates, or exists primarily to shock',
    trace: '§9.1 Governs', expected: 'VIOLATION',
    why: 'Glorification is the constitutive element and it is present; nothing defeats it.',
    severityTreatment: envelopeNote('S2–S3'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-VGH-2', policy: 'ts.violence.graphic-harm', kind: 'FALSE_POSITIVE',
    situation: 'A Vietnamese cooking video showing pig slaughter and blood (tiết canh preparation).',
    evidence: 'any food preparation',
    trace: '§9.1 Does not govern · §18 cases 1–4',
    expected: 'NOT_APPLICABLE',
    why: 'Food preparation is named in Does-not-govern, and blood is a topic (TOP-1) that cannot constitute the policy. Nothing is constituted, so there is nothing to defeat.',
    severityTreatment: 'Not reached — severity presupposes an established violation (SEV-9).',
    enforcement: NONE, harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-VGH-3', policy: 'ts.violence.graphic-harm', kind: 'AMBIGUOUS',
    situation: 'Atrocity footage published by a news outlet; the behavior is present but the purpose is journalistic.',
    evidence: 'behavior present but purpose is journalistic, shock-primacy absent',
    trace: '§18 case 6', expected: 'APPLICABLE_NO_VIOLATION',
    why: 'The corpus resolves this case to ANV explicitly: the behavior is present, and the journalistic purpose carries it.',
    severityTreatment: 'Not reached — ANV is not a violation.',
    enforcement: NONE, harness: { constitutive: 'TRUE', defeat: 'TRUE' },
  },

  // ── D1 · ts.violence.incitement-threats ───────────────────────────────────
  {
    id: 'UAT-VIT-1', policy: 'ts.violence.incitement-threats', kind: 'POSITIVE',
    situation: 'A post naming a specific person and calling on readers to attack them at a stated place.',
    evidence: 'credible threats of violence against identifiable people or groups',
    trace: '§9.1 Governs', expected: 'VIOLATION',
    why: 'Credibility and a target are both present, which the Constitutive boundary requires together.',
    severityTreatment: envelopeNote('S3–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-VIT-2', policy: 'ts.violence.incitement-threats', kind: 'FALSE_POSITIVE',
    situation: 'A football fan posts "we will destroy them tomorrow" about the opposing team.',
    evidence: 'gaming and sports idiom',
    trace: '§9.1 Does not govern',
    expected: 'NOT_APPLICABLE',
    why: 'Sports idiom is named in Does-not-govern; neither credibility nor a target of violence is established.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-VIT-3', policy: 'ts.violence.incitement-threats', kind: 'AMBIGUOUS',
    situation: 'Angry text with no discernible target; the record cannot establish whether a target exists.',
    evidence: 'anger without a target',
    trace: '§9.1 Does not govern · §4 INSUFFICIENT_EVIDENCE',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'A decisive element cannot be established from the record; §4 makes that a terminal non-violating outcome, not a weak violation (OUT-1).',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D1 · ts.selfharm.promotion ────────────────────────────────────────────
  {
    id: 'UAT-SHP-1', policy: 'ts.selfharm.promotion', kind: 'POSITIVE',
    situation: 'A post instructing readers in a specific self-harm method and urging them to try it.',
    evidence: 'encouraging self-harm or suicide; instructing in methods',
    trace: '§9.1 Governs', expected: 'VIOLATION',
    why: 'Promotion or instruction directed at others is the constitutive element.',
    severityTreatment: envelopeNote('S4') + ' Evidence is HUMAN_REQUIRED: no violation may be concluded without human review.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-SHP-2', policy: 'ts.selfharm.promotion', kind: 'FALSE_POSITIVE',
    situation: 'A user discloses their own distress and asks for help.',
    evidence: 'Support-seeking is `APPLICABLE_NO_VIOLATION`, response-warranted',
    trace: '§9.1 OUT-3 applies · §18 case 21',
    expected: 'APPLICABLE_NO_VIOLATION',
    why: 'The corpus names this outcome directly and warns that treating disclosure as a violation is itself a foreseeable harm. Disclosure is the inverse of the constitutive element.',
    severityTreatment: 'Not reached — ANV is not a violation.',
    enforcement: NONE,
    harness: { constitutive: 'TRUE', defeat: 'TRUE', responseWarranted: true },
  },
  {
    id: 'UAT-SHP-3', policy: 'ts.selfharm.promotion', kind: 'AMBIGUOUS',
    situation: 'A recovery narrative that also describes methods; whether it is directed at others cannot be read from the record.',
    evidence: 'recovery narrative',
    trace: '§9.1 Does not govern — explicitly and importantly',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'The decisive direction ("at others") is unestablished; the terminal non-violating outcome is correct and must not escalate.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D1 · ts.danger.harmful-activity ───────────────────────────────────────
  {
    id: 'UAT-DHA-1', policy: 'ts.danger.harmful-activity', kind: 'POSITIVE',
    situation: 'A video daring viewers to copy a stunt that poses serious physical risk.',
    evidence: 'presented as encouragement to imitate',
    trace: '§9.1 Governs', expected: 'VIOLATION',
    why: 'Presentation as encouragement to imitate is constitutive, and serious risk is required by the definition itself.',
    severityTreatment: envelopeNote('S3–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-DHA-2', policy: 'ts.danger.harmful-activity', kind: 'FALSE_POSITIVE',
    situation: 'A professional stunt performer documents a controlled stunt with visible expertise and safety crew.',
    evidence: 'professional/stunt content with evident expertise',
    trace: '§9.1 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern; the encouragement-to-imitate element is absent, so nothing is constituted.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-DHA-3', policy: 'ts.danger.harmful-activity', kind: 'AMBIGUOUS',
    situation: 'A short clip of a risky act with no caption, no audience signal and no context.',
    evidence: 'Setting is decisive on audience',
    trace: 'SC-1 decisive_dimensions · §6.1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'Setting is a decisive dimension for this policy and is unreadable from the record; CTX-1 makes that INDETERMINATE_CONTEXT, never a violation.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'TRUE', contextUnreadable: true },
  },

  // ── D1 · ts.graphic.presentation (RESTRICTED) ─────────────────────────────
  {
    id: 'UAT-GP-1', policy: 'ts.graphic.presentation', kind: 'POSITIVE',
    situation: 'Intensely graphic imagery autoplays in a feed; the viewer did not select that item.',
    evidence: 'RESTRICTED`, not a violation',
    trace: '§18 case 3 · §9.1 Governs · Owner decision 2026-08-16 (b)',
    expected: 'APPLICABLE_NO_VIOLATION',
    why: 'The constitutive element (NOT_VIEWER_INITIATED) is present, so the behavior is present — but a RESTRICTED disposition establishes no violation, and §18 case 3 records the result as "RESTRICTED, not a violation". Owner decision 2026-08-16 (b) assigns the existing §4 class APPLICABLE_NO_VIOLATION, with `presentationConditionsApply` carrying the conditions half as metadata. No new outcome class, no action.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-GP-2', policy: 'ts.graphic.presentation', kind: 'FALSE_POSITIVE',
    situation: 'A viewer deliberately opens a surgical training video they searched for.',
    evidence: 'not the intensity of the imagery',
    trace: '§9.1 Constitutive boundary · §18 case 5',
    expected: 'NOT_APPLICABLE',
    why: 'Viewer-initiated viewing means the constitutive element is absent. Intensity is a topic (TOP-1) and can never constitute this policy.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-GP-3', policy: 'ts.graphic.presentation', kind: 'AMBIGUOUS',
    situation: 'The presentation event was not recorded, so it cannot be established how the item came to be shown.',
    evidence: 'INITIATION_UNAVAILABLE',
    trace: '§6.1 viewing initiation · CTX-1',
    expected: 'INDETERMINATE_CONTEXT',
    why: 'CTX-1 maps the unavailable initiation state to INDETERMINATE_CONTEXT, never a violation.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'TRUE', contextUnreadable: true },
  },

  // ── D2 · child safety (CS-0: no defeating context, ever) ──────────────────
  {
    id: 'UAT-CSE-1', policy: 'ts.child.sexual-exploitation', kind: 'POSITIVE',
    situation: 'Material depicting the sexual exploitation of a minor.',
    evidence: 'sexual exploitation of minors, and material depicting it',
    trace: 'SC-1 constitutive_behavior', expected: 'VIOLATION',
    why: 'Constitutive on its own terms. CS-0: no context defeats it.',
    severityTreatment: envelopeNote('S4') + ' Evidence is LEGALLY_SENSITIVE + RESTRICTED_HANDLING + HUMAN_REQUIRED (CS-1).',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-CSE-2', policy: 'ts.child.sexual-exploitation', kind: 'FALSE_POSITIVE',
    situation: 'A paediatric clinical photograph in a medical record.',
    evidence: 'clinical or medical content',
    trace: 'SC-1 does_not_govern', expected: 'NOT_APPLICABLE',
    why: 'Named in does_not_govern. Nothing is constituted — this is constitutive context (§6.2), not a defeating context, which CS-0 forbids this domain from declaring.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-CSE-3', policy: 'ts.child.sexual-exploitation', kind: 'AMBIGUOUS',
    situation: 'Sexualised material where the subject\'s age cannot be established from the record.',
    evidence: 'AGE_INSUFFICIENT_TO_ESTABLISH',
    trace: '§6.1 age context · CS-3 · CS-5',
    expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Age is decisive and unresolved; the corpus makes every unresolved-age state a terminal non-violating outcome. It is neither a violation nor a clearance.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'UAT-CSX-1', policy: 'ts.child.sexualization', kind: 'POSITIVE',
    situation: 'A minor presented in a sexualised manner with no explicit act depicted.',
    evidence: 'presenting minors in a sexualised manner, including where no explicit act is depicted',
    trace: 'SC-1 constitutive_behavior', expected: 'VIOLATION',
    why: 'The policy covers the non-explicit band by construction.',
    severityTreatment: envelopeNote('S3–S4') + ' CS-1 evidence markers apply.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-CSX-2', policy: 'ts.child.sexualization', kind: 'FALSE_POSITIVE',
    situation: 'A family beach photograph of children playing.',
    // Quote chosen to sit inside one plain run: the corpus bolds each of
    // "family", "medical" and "educational" individually, so the flowing
    // sentence is not a verbatim substring.
    evidence: 'imagery of minors',
    trace: 'SC-1 does_not_govern', expected: 'NOT_APPLICABLE',
    why: 'Named in does_not_govern; the constitutive boundary is drawn at sexualised presentation precisely so ordinary imagery never enters.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-CSX-3', policy: 'ts.child.sexualization', kind: 'AMBIGUOUS',
    situation: 'Imagery where it cannot be established whether the presentation is sexualising.',
    evidence: 'Setting** is decisive on **age context',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'A decisive element is unestablished; terminal non-violating, and it must not drift upward.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'UAT-CG-1', policy: 'ts.child.grooming', kind: 'POSITIVE',
    situation: 'A sustained pattern of messages building exploitative trust with a minor.',
    evidence: 'patterned conduct to build exploitative trust with a minor',
    trace: 'SC-1 constitutive_behavior', expected: 'VIOLATION',
    why: 'The pattern is the constitutive element and it is established.',
    severityTreatment: envelopeNote('S4') + ' CS-1 evidence markers apply.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-CG-2', policy: 'ts.child.grooming', kind: 'FALSE_POSITIVE',
    situation: 'One friendly message from a coach to a team member, with no pattern.',
    // "isolated single message" is bolded in the corpus; quote the plain tail.
    evidence: 'absent an established pattern',
    trace: 'SC-1 does_not_govern', expected: 'NOT_APPLICABLE',
    why: 'Named in does_not_govern; without a pattern the policy is not constituted.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-CG-3', policy: 'ts.child.grooming', kind: 'AMBIGUOUS',
    situation: 'A partial message history where a pattern can be neither confirmed nor excluded.',
    evidence: 'Actor & target** is decisive on the minor as target',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'The pattern is decisive and the record cannot support a conclusion either way.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },
  {
    id: 'UAT-CAH-1', policy: 'ts.child.abuse-harm', kind: 'POSITIVE',
    situation: 'Footage of a child being physically abused, posted approvingly.',
    evidence: 'non-sexual abuse or endangerment of minors',
    trace: 'SC-1 constitutive_behavior', expected: 'VIOLATION',
    why: 'Constitutive on its own terms; CS-0 means no context defeats it.',
    severityTreatment: envelopeNote('S3–S4') + ' CS-1 evidence markers apply.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-CAH-2', policy: 'ts.child.abuse-harm', kind: 'FALSE_POSITIVE',
    situation: 'An NGO documents child endangerment in a protective report.',
    evidence: 'documentation for protective, journalistic or educational purposes',
    trace: 'SC-1 does_not_govern', expected: 'NOT_APPLICABLE',
    why: 'Named in does_not_govern. Protective documentation is not the abuse itself — a constitutive distinction, not an exception granted afterwards.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-CAH-3', policy: 'ts.child.abuse-harm', kind: 'AMBIGUOUS',
    situation: 'A clip whose subject may or may not be a minor, and the record cannot settle it.',
    evidence: 'AGE_UNCERTAIN',
    trace: '§6.1 age context · CS-3', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Age is decisive and unresolved; terminal non-violating by CS-5.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D3 · ts.sexual.exploitation-nonconsent ────────────────────────────────
  {
    id: 'UAT-SEN-1', policy: 'ts.sexual.exploitation-nonconsent', kind: 'POSITIVE',
    situation: 'Intimate images shared without the subject\'s consent.',
    evidence: 'sexual content produced or shared without consent',
    trace: '§9.3 Governs', expected: 'VIOLATION',
    why: 'Consent is constitutive and its absence is established.',
    severityTreatment: envelopeNote('S3–S4') + ' Evidence is CORROBORATED + RESTRICTED_HANDLING.',
    enforcement: NONE, harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-SEN-2', policy: 'ts.sexual.exploitation-nonconsent', kind: 'FALSE_POSITIVE',
    situation: 'A survivor publishes their own account of sexual violence.',
    evidence: 'survivor narrative',
    trace: '§9.3 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern; a survivor narrative is not the constituted conduct.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-SEN-3', policy: 'ts.sexual.exploitation-nonconsent', kind: 'AMBIGUOUS',
    situation: 'Adult content where consent can be neither established nor excluded from the record.',
    evidence: 'Actor & target is decisive on **consent**',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Consent is the decisive element and it is unresolved; the outcome is terminal and non-violating.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D3 · ts.sexual.adult-content (RESTRICTED) ─────────────────────────────
  {
    id: 'UAT-SAC-1', policy: 'ts.sexual.adult-content', kind: 'POSITIVE',
    situation: 'Consensual adult sexual content presented without the required presentation conditions.',
    evidence: 'absence of the required presentation conditions',
    trace: '§9.3 Constitutive boundary · Owner decision 2026-08-16 (b)',
    expected: 'APPLICABLE_NO_VIOLATION',
    why: 'Same shape as UAT-GP-1. The constitutive element is present and the corpus states this is "not a prohibition"; Owner decision 2026-08-16 (b) assigns APPLICABLE_NO_VIOLATION with the `presentationConditionsApply` attribute. The content is permitted — what is missing is the presentation conditions, and naming them is Group 09 work that has not started.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-SAC-2', policy: 'ts.sexual.adult-content', kind: 'FALSE_POSITIVE',
    situation: 'A sexual-health education video for adults.',
    evidence: 'sexual education',
    trace: '§9.3 Does not govern · §18 case 23', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern; explicitness is a topic (TOP-1) and cannot constitute the policy.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-SAC-3', policy: 'ts.sexual.adult-content', kind: 'AMBIGUOUS',
    situation: 'Content whose audience and surface conditions cannot be read from the record.',
    evidence: 'Setting** is decisive because the constitutive element is the **absence of the required presentation conditions',
    trace: 'SC-1 decisive_dimensions', expected: 'INDETERMINATE_CONTEXT',
    why: 'Setting is decisive and unreadable; CTX-1 gives INDETERMINATE_CONTEXT, never a violation.',
    severityTreatment: noEnvelope, enforcement: NONE,
    harness: { constitutive: 'TRUE', contextUnreadable: true },
  },

  // ── D4 · ts.harassment.targeted ───────────────────────────────────────────
  {
    id: 'UAT-HT-1', policy: 'ts.harassment.targeted', kind: 'POSITIVE',
    situation: 'A sustained pile-on of degrading messages aimed at one named person.',
    evidence: 'sustained or coordinated pile-on',
    trace: '§9.4 Governs', expected: 'VIOLATION',
    why: 'An identifiable target and abuse directed at the person are both present.',
    severityTreatment: envelopeNote('S2–S3'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-HT-2', policy: 'ts.harassment.targeted', kind: 'FALSE_POSITIVE',
    situation: 'A harsh one-star review of a restaurant, and a blunt criticism of a minister\'s public decision.',
    evidence: 'criticism of ideas, institutions, products, governments or public conduct',
    trace: '§9.4 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'The abuse must be directed at the person rather than their position or work. This is where VP-1 does its heaviest work.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-HT-3', policy: 'ts.harassment.targeted', kind: 'AMBIGUOUS',
    situation: 'Abusive text with no identifiable target discernible from the record.',
    evidence: 'requires an **identifiable target**',
    trace: '§9.4 Constitutive boundary', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'A required element cannot be established; terminal non-violating.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D4 · ts.privacy.personal-information ──────────────────────────────────
  {
    id: 'UAT-PPI-1', policy: 'ts.privacy.personal-information', kind: 'POSITIVE',
    situation: 'A post publishing someone\'s home address and phone number to provoke harassment.',
    evidence: 'publishing private identifying information without consent',
    trace: '§9.4 Governs', expected: 'VIOLATION',
    why: 'Consent is absent and the exposure creates risk of harm.',
    severityTreatment: envelopeNote('S2–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-PPI-2', policy: 'ts.privacy.personal-information', kind: 'FALSE_POSITIVE',
    situation: 'A restaurant\'s public business phone number reposted in a review.',
    evidence: 'business contact details',
    trace: '§9.4 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern, as is already-public information in its ordinary context.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-PPI-3', policy: 'ts.privacy.personal-information', kind: 'AMBIGUOUS',
    situation: 'Personal details appear in a post; whether the subject consented cannot be established.',
    evidence: 'Actor & target is decisive on **consent** and on self-disclosure versus disclosure of another',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Consent is decisive and unresolved; terminal non-violating.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D5 · ts.animal.cruelty ────────────────────────────────────────────────
  {
    id: 'UAT-AC-1', policy: 'ts.animal.cruelty', kind: 'POSITIVE',
    situation: 'A video of an animal being tormented for entertainment.',
    evidence: 'for entertainment or spectacle',
    trace: '§9.5 Governs', expected: 'VIOLATION',
    why: 'Suffering gratuitous relative to purpose is the constitutive element and it is present.',
    severityTreatment: envelopeNote('S1–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-AC-2', policy: 'ts.animal.cruelty', kind: 'FALSE_POSITIVE',
    situation: 'Slaughter of poultry for food, filmed on a farm.',
    evidence: 'legitimate purpose, suffering not materially beyond it',
    trace: '§18 case 3', expected: 'NOT_APPLICABLE',
    why: 'The corpus resolves this case directly: where a legitimate purpose is present and suffering does not materially exceed it, the policy is not constituted — there is no exception to grant because nothing was constituted.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-AC-3', policy: 'ts.animal.cruelty', kind: 'AMBIGUOUS',
    situation: 'Footage of an animal in distress with no purpose discernible from the record.',
    evidence: 'gratuitousness relative to purpose',
    trace: '§9.5 Constitutive boundary', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Purpose is the sole decisive dimension for this policy and it is unestablished.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D6 · ts.deception.harmful ─────────────────────────────────────────────
  {
    id: 'UAT-DH-1', policy: 'ts.deception.harmful', kind: 'POSITIVE',
    situation: 'A knowingly false health claim that induces readers to abandon treatment.',
    evidence: 'materially harmful deception',
    trace: '§9.6 Governs', expected: 'VIOLATION',
    why: 'All four conjunctive elements are established, including a policy-relevant harm class.',
    severityTreatment: envelopeNote('S2–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-DH-2', policy: 'ts.deception.harmful', kind: 'FALSE_POSITIVE',
    situation: 'A blogger states an incorrect date in good faith and corrects it later.',
    evidence: 'factual error',
    trace: '§9.6 Does not govern · §18 case 26', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern; the intent element fails, and absent any one of the four elements the policy is not constituted.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-DH-3', policy: 'ts.deception.harmful', kind: 'AMBIGUOUS',
    situation: 'A contested claim about an unfolding event that cannot presently be settled.',
    evidence: 'terminal, **not a violation** (DEC-3, OUT-1)',
    trace: '§18 case 25', expected: 'NOT_ESTABLISHED',
    why: 'GAP AT ENGINE LEVEL. The corpus assigns DISPUTED to this case, but §9.6 makes DISPUTED a case-level judgement about an unsettleable factual question, and the engine deliberately does not derive it from a predicate. Corpus-established, engine-unreachable.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D6 · ts.fraud.scam ────────────────────────────────────────────────────
  {
    id: 'UAT-FS-1', policy: 'ts.fraud.scam', kind: 'POSITIVE',
    situation: 'A fake bank page collecting login credentials.',
    evidence: 'deceptive schemes to obtain money, credentials or assets',
    trace: '§9.6 Governs', expected: 'VIOLATION',
    why: 'Intent to obtain credentials by deception is the constitutive element.',
    severityTreatment: envelopeNote('S2–S3'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-FS-2', policy: 'ts.fraud.scam', kind: 'FALSE_POSITIVE',
    situation: 'A high-risk but lawful investment offer with disclosed risk, and a negative review of it.',
    evidence: 'lawful risk-bearing offers',
    trace: '§9.6 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern alongside legitimate commerce and negative reviews.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-FS-3', policy: 'ts.fraud.scam', kind: 'AMBIGUOUS',
    situation: 'An offer that may or may not be genuine; intent cannot be established from the record.',
    evidence: 'Actor & target is decisive on the intent to obtain money, credentials or assets',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Intent is decisive and unresolved; terminal non-violating.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },

  // ── D6 · ts.platform.abuse-manipulation ───────────────────────────────────
  {
    id: 'UAT-PAM-1', policy: 'ts.platform.abuse-manipulation', kind: 'POSITIVE',
    situation: 'A network of accounts coordinated to mass-report a competitor.',
    evidence: 'abuse of the reporting system itself',
    trace: '§9.6 Governs', expected: 'VIOLATION',
    why: 'Retaliatory or brigaded reporting is named as constitutive.',
    severityTreatment: envelopeNote('S1–S4'), enforcement: NONE,
    harness: { constitutive: 'TRUE' },
  },
  {
    id: 'UAT-PAM-2', policy: 'ts.platform.abuse-manipulation', kind: 'FALSE_POSITIVE',
    situation: 'A campaign goes viral because many unconnected users genuinely share it.',
    evidence: 'organic popularity',
    trace: '§9.6 Does not govern', expected: 'NOT_APPLICABLE',
    why: 'Named in Does-not-govern, as is genuine coordinated advocacy.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'FALSE' },
  },
  {
    id: 'UAT-PAM-3', policy: 'ts.platform.abuse-manipulation', kind: 'AMBIGUOUS',
    situation: 'Simultaneous posts from several accounts; whether coordination is inauthentic cannot be established.',
    evidence: 'Actor & target is decisive on authenticity and coordination of the acting party',
    trace: 'SC-1 decisive_dimensions', expected: 'INSUFFICIENT_EVIDENCE',
    why: 'Authenticity is decisive and unresolved; terminal non-violating.',
    severityTreatment: 'Not reached.', enforcement: NONE,
    harness: { constitutive: 'UNKNOWN' },
  },
]);

/**
 * Whether a scenario's outcome is settled by the corpus, or still needs the
 * Product Owner.
 *
 * Derived rather than typed per-scenario on purpose: the two states are exactly
 * "the corpus determines this" and "the corpus is silent", and `NOT_ESTABLISHED`
 * already records the second. Deriving it means the two can never disagree.
 */
export type Determination = 'CORPUS_DETERMINED' | 'PRODUCT_DECISION_REQUIRED';

export function determinationOf(s: UatScenario): Determination {
  return s.expected === 'NOT_ESTABLISHED' ? 'PRODUCT_DECISION_REQUIRED' : 'CORPUS_DETERMINED';
}

/** The 18th policy is excluded on purpose; it is not ratifiable while G02-D-07b is open. */
export const UAT_EXCLUDED_POLICY = 'ts.hate.protected-target-abuse' as const;
export const UAT_EXCLUSION_REASON =
  'Blocked by G02-D-07b: severity_envelope is OPEN and PROTECTED_TARGET_SET is undecided. ' +
  'A scenario would have to assume which characteristics qualify, which is exactly the Legal question.';

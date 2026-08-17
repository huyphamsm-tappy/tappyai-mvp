/**
 * The eleven evidence-gated policies: five `HUMAN_REQUIRED`, six `CORROBORATED`.
 *
 * Each has a real constitutive definition transcribed from the corpus, and each
 * runs through `evidenceGate.ts`, which holds back any finding until the
 * corpus's evidence requirement is met. Nothing here can conclude a violation on
 * machine evidence alone where the corpus forbids it.
 *
 * ============================================================================
 * TWO CORPUS RULES THAT CHANGED THE DESIGN
 * ============================================================================
 * **CS-0.3 — a purpose claim has no force once the behavior is constituted.**
 * "An exploitative behavior *presented as* education, documentation or research
 * remains a VIOLATION." The shared resolver checks carve-outs BEFORE the
 * decisive element, which is right where a `Does not govern` item is an
 * independent non-governance rule — and wrong for child safety, where it would
 * let a claimed purpose acquit established conduct. So every `ts.child.*` policy
 * declares `carveOuts: []`, and its `does_not_govern` items operate where the
 * corpus puts them: at the earlier *what happened* stage (CS-0.2), inside the
 * decisive determination itself. Same reasoning as `ts.animal.cruelty`.
 *
 * **OUT-3 — support-seeking is not a violation, and must not be able to be.**
 * `ts.selfharm.promotion`: "Support-seeking is `APPLICABLE_NO_VIOLATION`,
 * response-warranted. Treating disclosure as violation is itself a foreseeable
 * harm and this policy is written to make that structurally impossible." That is
 * a different outcome from `NOT_APPLICABLE`, and {@link selfHarmDisclosure}
 * produces it through the engine's own §6.3 input rather than by inventing one.
 */

import type { Expression } from '../engine/expression';
import type { ConstitutionEvaluationExtras, PolicyConstitution } from './constitution';

// ---------------------------------------------------------------------------
// HUMAN_REQUIRED — child safety (CS-1) and self-harm
// ---------------------------------------------------------------------------

/**
 * #6 `ts.child.sexual-exploitation`.
 *
 * 🔒 `carveOuts: []` per CS-0.3 — clinical, documentary, educational and
 * historical context bear on whether the behavior is present at all, and can
 * never excuse it once it is.
 */
export const CHILD_SEXUAL_EXPLOITATION: PolicyConstitution = Object.freeze({
  ref: 'ts.child.sexual-exploitation@1',
  decisive: 'sexualExploitationOfMinorEstablished',
  carveOuts: [],
  corpusPhrases: ['sexual exploitation of minors, and material depicting it'],
  decisiveSource:
    'Whether sexual exploitation of a minor is established. HUMAN_REQUIRED: no violation without human review.',
});

/** #7 `ts.child.sexualization`. Boundary drawn at sexualised presentation. */
export const CHILD_SEXUALIZATION: PolicyConstitution = Object.freeze({
  ref: 'ts.child.sexualization@1',
  decisive: 'sexualisedPresentationOfMinorEstablished',
  carveOuts: [],
  corpusPhrases: [
    'presenting minors in a sexualised manner, including where no explicit act is depicted',
  ],
  decisiveSource:
    'Whether the presentation is sexualised. Ordinary family, medical and educational imagery is not, which is a question about what the thing IS.',
});

/**
 * #8 `ts.child.grooming`. Pattern-based, subject type `interaction`.
 *
 * 🔑 The corpus's own carve-out — "an isolated single message absent an
 * established pattern" — is the inverse of the decisive element, not an excuse:
 * without a pattern there is nothing to excuse.
 */
export const CHILD_GROOMING: PolicyConstitution = Object.freeze({
  ref: 'ts.child.grooming@1',
  decisive: 'exploitativeTrustPatternEstablished',
  carveOuts: [],
  corpusPhrases: [
    'patterned conduct to build exploitative trust with a minor',
    'a single message is rarely constitutive',
  ],
  decisiveSource:
    'Whether a pattern of exploitative trust-building is established. A single message is not a pattern.',
});

/**
 * #9 `ts.child.abuse-harm`.
 *
 * 🔑 The corpus excludes protective, journalistic and educational documentation
 * "by defining the behavior as the abuse itself, not its depiction" — again
 * constitutive, not a carve-out.
 */
export const CHILD_ABUSE_HARM: PolicyConstitution = Object.freeze({
  ref: 'ts.child.abuse-harm@1',
  decisive: 'abuseOrEndangermentOfMinorEstablished',
  carveOuts: [],
  corpusPhrases: ['non-sexual abuse or endangerment of minors'],
  decisiveSource:
    'Whether the abuse itself is established, as distinct from its depiction.',
});

/**
 * #3 `ts.selfharm.promotion`.
 *
 * 🚨 The decisive element is direction: "promotion or instruction directed at
 * others. Disclosure is its inverse." A detector that fires on self-harm as a
 * topic inverts the policy and harms the people it exists to protect.
 */
export const SELFHARM_PROMOTION: PolicyConstitution = Object.freeze({
  ref: 'ts.selfharm.promotion@1',
  decisive: 'promotionOrInstructionDirectedAtOthers',
  carveOuts: [],
  corpusPhrases: [
    'encouraging self-harm or suicide; instructing in methods',
    'promotion or instruction directed at others',
    'personal disclosure · support-seeking · recovery narrative · prevention and awareness · education · journalism · memorial · clinical discussion',
  ],
  decisiveSource:
    'Whether the content is directed at others as promotion or instruction. HUMAN_REQUIRED.',
});

/**
 * OUT-3 for `ts.selfharm.promotion`: personal disclosure and support-seeking.
 *
 * Produces `APPLICABLE_NO_VIOLATION` with `responseWarranted`, which is what the
 * corpus assigns — NOT `NOT_APPLICABLE`, and never a violation. The response
 * itself belongs to Group 09 and is not named here; this records only that one
 * is warranted.
 *
 * 🔑 Pass this to `evaluateConstitution` / `evaluateGated` as `extra` when
 * disclosure or support-seeking is established. It is supplied by the caller and
 * never inferred, exactly like every other signal in this module.
 */
const ALWAYS: Expression = { op: 'eq', left: { value: 1 }, right: { value: 1 } };

export function selfHarmDisclosure(): ConstitutionEvaluationExtras {
  return { defeatingContext: ALWAYS, responseWarranted: true };
}

// ---------------------------------------------------------------------------
// CORROBORATED
// ---------------------------------------------------------------------------

/**
 * #2 `ts.violence.incitement-threats`.
 *
 * 🔑 "Requires credibility and a target. Both, together." Modelled as one
 * decisive element so a detector cannot satisfy half of it and call it done;
 * the conjunction belongs to the signal that establishes it.
 */
export const INCITEMENT_THREATS: PolicyConstitution = Object.freeze({
  ref: 'ts.violence.incitement-threats@1',
  decisive: 'credibleThreatAgainstIdentifiableTargetEstablished',
  carveOuts: [
    'hyperbole',
    'fiction',
    'gamingOrSportsIdiom',
    'reportingOnThreatsMadeByOthers',
    'advocacyForLawfulAction',
    'angerWithoutATarget',
  ],
  corpusPhrases: [
    'credible threats of violence against identifiable people or groups',
    'hyperbole · fiction · gaming and sports idiom · reporting on threats made by others · advocacy for lawful action · anger without a target',
    'requires **credibility** and a **target**. Both, together',
  ],
  decisiveSource: 'Credibility AND an identifiable target, together. CORROBORATED.',
});

/** #10 `ts.sexual.exploitation-nonconsent`. Also carries RESTRICTED_HANDLING. */
export const SEXUAL_EXPLOITATION_NONCONSENT: PolicyConstitution = Object.freeze({
  ref: 'ts.sexual.exploitation-nonconsent@1',
  decisive: 'nonConsensualSexualConductEstablished',
  carveOuts: ['consensualAdultContent', 'fiction', 'education', 'survivorNarrative', 'journalism'],
  corpusPhrases: [
    'sexual content produced or shared without consent',
    'consensual adult content · fiction · education · survivor narrative · journalism',
  ],
  decisiveSource: 'Whether the conduct was non-consensual. CORROBORATED + RESTRICTED_HANDLING.',
});

/**
 * #12 `ts.harassment.targeted`.
 *
 * 🔑 "Requires an identifiable target and abuse directed at the person rather
 * than at their position or work." The carve-outs are the other side of the same
 * line — criticism of ideas, institutions, products, governments, negative
 * reviews. On a review platform this boundary carries most of the weight.
 */
export const HARASSMENT_TARGETED: PolicyConstitution = Object.freeze({
  ref: 'ts.harassment.targeted@1',
  decisive: 'abuseDirectedAtIdentifiablePersonEstablished',
  carveOuts: [
    'criticismOfIdeasInstitutionsProductsOrGovernments',
    'unflatteringReporting',
    'negativeReviews',
    'robustDisagreement',
    'satireOfPublicFiguresInPublicRole',
  ],
  corpusPhrases: [
    'directed abuse at identifiable people; sustained or coordinated pile-on',
    'criticism of ideas, institutions, products, governments or public conduct · unflattering reporting · negative reviews · robust disagreement · satire of public figures in their public role',
  ],
  decisiveSource:
    'Abuse at the person rather than their position or work, with an identifiable target. CORROBORATED.',
});

/**
 * #16 `ts.deception.harmful`.
 *
 * 🔑 Four conjunctive elements: deception ∧ relevant intent or knowing
 * misrepresentation ∧ materiality / relevant harm ∧ applicable target and
 * context. "Absent any one, not constituted."
 */
export const DECEPTION_HARMFUL: PolicyConstitution = Object.freeze({
  ref: 'ts.deception.harmful@1',
  decisive: 'allFourDeceptionElementsEstablished',
  carveOuts: [
    'factualError',
    'uncertainty',
    'opinion',
    'satireAndParody',
    'fiction',
    'marketingAndPromotionalExpression',
    'disputedClaims',
    'minorityScientificPositions',
    'politicalArgument',
    'religiousBelief',
    'historicalInterpretation',
    'updatedOrEvolvingInformation',
  ],
  corpusPhrases: [
    'Absent any one, **not constituted**',
    'factual error · uncertainty · opinion · satire and parody · fiction · marketing and promotional expression · disputed claims',
  ],
  decisiveSource: 'All four conjunctive elements of §9.6.1, together. CORROBORATED.',
});

/** #17 `ts.fraud.scam`. On-platform conduct only — scam-shield is external. */
export const FRAUD_SCAM: PolicyConstitution = Object.freeze({
  ref: 'ts.fraud.scam@1',
  decisive: 'deceptiveSchemeForGainEstablished',
  carveOuts: [
    'legitimateCommerce',
    'advertising',
    'disputedBusinessPractice',
    'negativeReviews',
    'lawfulRiskBearingOffers',
  ],
  corpusPhrases: [
    'deceptive schemes to obtain money, credentials or assets',
    'legitimate commerce · advertising · disputed business practice · negative reviews · lawful risk-bearing offers',
  ],
  decisiveSource: 'Whether a deceptive scheme for gain is established. CORROBORATED.',
});

/**
 * #18 `ts.platform.abuse-manipulation`.
 *
 * 🔑 Subject type is "primarily `actor` and `coordinated set`, not single items"
 * — this one does not classify a review, it classifies behaviour across
 * accounts. The corpus explicitly includes "abuse of the reporting system
 * itself, including retaliatory or brigaded reporting", which matters the moment
 * a reporting flow ever exists.
 */
export const PLATFORM_ABUSE: PolicyConstitution = Object.freeze({
  ref: 'ts.platform.abuse-manipulation@1',
  decisive: 'coordinatedInauthenticBehaviourEstablished',
  carveOuts: [
    'organicPopularity',
    'legitimatePromotion',
    'genuineCoordinatedAdvocacy',
    'multipleAccountsForLegitimatePurposes',
  ],
  corpusPhrases: [
    'coordinated inauthentic behavior; engagement manipulation; ban evasion',
    'organic popularity · legitimate promotion · genuine coordinated advocacy · multiple accounts for legitimate purposes',
  ],
  decisiveSource:
    'Whether coordinated inauthentic behaviour is established across an actor or coordinated set. CORROBORATED.',
});

// ---------------------------------------------------------------------------

export const HUMAN_REQUIRED_POLICIES: readonly PolicyConstitution[] = Object.freeze([
  CHILD_SEXUAL_EXPLOITATION,
  CHILD_SEXUALIZATION,
  CHILD_GROOMING,
  CHILD_ABUSE_HARM,
  SELFHARM_PROMOTION,
]);

export const CORROBORATED_POLICIES: readonly PolicyConstitution[] = Object.freeze([
  INCITEMENT_THREATS,
  SEXUAL_EXPLOITATION_NONCONSENT,
  HARASSMENT_TARGETED,
  DECEPTION_HARMFUL,
  FRAUD_SCAM,
  PLATFORM_ABUSE,
]);

export const GATED_POLICIES: readonly PolicyConstitution[] = Object.freeze([
  ...HUMAN_REQUIRED_POLICIES,
  ...CORROBORATED_POLICIES,
]);

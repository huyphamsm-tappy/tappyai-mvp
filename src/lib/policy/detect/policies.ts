/**
 * The five `ORDINARY`-evidence policies given a detector, beside P1.
 *
 * Each entry is transcribed from `02_POLICY_TAXONOMY.md` §9 and contains no
 * judgement of mine: `decisive` is the element the corpus names as constitutive,
 * `carveOuts` are its `Does not govern` items, and `corpusPhrases` are quoted
 * verbatim so a test can prove the file still matches the text it implements.
 *
 * P1 `ts.privacy.personal-information` is deliberately ABSENT. Its semantics are
 * frozen by Owner decision of 2026-08-17 and it keeps its own module and its own
 * tests; folding it in here would mean editing frozen code to refactor it.
 *
 * ============================================================================
 * WHAT EVERY ONE OF THESE RETURNS TODAY
 * ============================================================================
 * `UNDETERMINED`, for almost everything. Each decisive element names something
 * no detector in this product can currently establish — glorification, intent to
 * encourage imitation, a presentation event, a set of required presentation
 * conditions, gratuitousness relative to purpose. That is the honest answer and
 * the mandated one: insufficient evidence stays uncertainty and never becomes a
 * finding. What is built here is the machinery that will hold the answer once
 * something can supply it, together with the guards that stop anyone supplying
 * it from a keyword.
 */

import type { PolicyConstitution } from './constitution';

/**
 * #1 `ts.violence.graphic-harm` — PROHIBITED, ORDINARY.
 *
 * 🔑 The constitutive boundary is explicit that a topic can never constitute it:
 * "Blood is a topic (TOP-1) and cannot constitute this policy." A detector that
 * fires on injury or blood is implementing the opposite of this policy.
 */
export const GRAPHIC_HARM: PolicyConstitution = Object.freeze({
  ref: 'ts.violence.graphic-harm@1',
  decisive: 'glorificationOrShockPrimacy',
  carveOuts: [
    'news',
    'documentary',
    'historicalRecord',
    'medicalSurgical',
    'education',
    'fictionOrArtisticDepiction',
    'ordinaryDepictionIncidentalToNarrative',
    'foodPreparation',
  ],
  corpusPhrases: [
    'glorification or shock-primacy',
    'news · documentary · historical record · medical/surgical · education · fiction and artistic depiction · ordinary depiction incidental to a narrative',
    'any food preparation',
    'Blood is a topic (TOP-1) and cannot constitute this policy',
  ],
  decisiveSource:
    'Whether a depiction glorifies, celebrates or exists primarily to shock. No signal in this product establishes it.',
});

/**
 * #4 `ts.danger.harmful-activity` — PROHIBITED, ORDINARY.
 *
 * 🔑 The qualifier lives inside `Governs`: risk alone is not constitutive, the
 * material must be "presented as encouragement to imitate". "Lawful activity
 * that is merely dangerous" is expressly outside.
 */
export const HARMFUL_ACTIVITY: PolicyConstitution = Object.freeze({
  ref: 'ts.danger.harmful-activity@1',
  decisive: 'presentedAsEncouragementToImitate',
  carveOuts: [
    'professionalOrStuntWithEvidentExpertise',
    'safetyEducation',
    'warningContent',
    'fiction',
    'documentationOfRisk',
    'lawfulActivityMerelyDangerous',
  ],
  corpusPhrases: [
    'presented as encouragement to imitate',
    'professional/stunt content with evident expertise · safety education · warning content · fiction · documentation of risk · lawful activity that is merely dangerous',
  ],
  decisiveSource:
    'Whether the material encourages imitation. No signal in this product establishes it.',
});

/**
 * #5 `ts.graphic.presentation` — RESTRICTED, ORDINARY.
 *
 * 🚨 THE STRONGEST ANTI-INFERENCE RULE IN THE CORPUS. The decisive element is
 * the viewing-initiation state of the presentation event, and the corpus says it
 * "must be established from the presentation event, never inferred from subject
 * matter, content class, intensity, or the policy category under which the item
 * was retrieved."
 *
 * 🔑 Constituted here yields `APPLICABLE_NO_VIOLATION` plus the presentation-
 * conditions attribute — never a violation. §18 case 3: "RESTRICTED, not a
 * violation."
 *
 * 🔑 There are no carve-outs: this policy's `Does not govern` line disclaims
 * other policies' work rather than naming situations it fails to reach. Content
 * the viewer DID initiate makes the decisive signal `false`, which is
 * non-constitution — the corpus is explicit that this is not
 * `INDETERMINATE_CONTEXT`.
 *
 * ✅ PRODUCT BASELINE SUPPLIED (Owner, 2026-08-17). The signal layer lives in
 * `presentationEvidence.ts`: initiation is established from an observed
 * presentation event and from nothing else. No surface-to-initiation table is
 * invented, and no surface currently emits the signal — so this answers
 * UNDETERMINED today, which is the instructed behaviour, not a gap.
 */
export const GRAPHIC_PRESENTATION: PolicyConstitution = Object.freeze({
  ref: 'ts.graphic.presentation@1',
  decisive: 'viewingNotInitiatedByViewer',
  carveOuts: [],
  corpusPhrases: [
    'viewing of the assessed item',
    'never inferred from subject matter, content class, intensity',
    'NOT_VIEWER_INITIATED',
    '(audience or interstitial)',
  ],
  decisiveSource:
    'The viewing-initiation state of an observed presentation event — see presentationEvidence.ts. No TappyAI surface emits it yet, so it stays undetermined.',
});

/**
 * #11 `ts.sexual.adult-content` — RESTRICTED, ORDINARY.
 *
 * 🔑 Constitutive element is "the absence of the required presentation
 * conditions", not explicitness — "Explicitness is a topic (TOP-1) and cannot
 * constitute this policy."
 *
 * ✅ PRODUCT BASELINE SUPPLIED (Owner, 2026-08-17). The signal layer lives in
 * `presentationEvidence.ts`. The corpus records that the required conditions are
 * "implementation work, not settled here", so the required SET is supplied per
 * case rather than fixed globally — a global list would be inventing the
 * threshold the corpus left open. An unread condition is never an absent one.
 *
 * 🚨 Scope guard from the corpus: minors in any form, non-consensual sexual
 * content, sexual exploitation and sexual violence or coercion are NOT governed
 * here — they stay with D2 and `ts.sexual.exploitation-nonconsent`, both of
 * which are blocked and neither of which is touched.
 */
export const ADULT_CONTENT: PolicyConstitution = Object.freeze({
  ref: 'ts.sexual.adult-content@1',
  decisive: 'requiredPresentationConditionsAbsent',
  carveOuts: [
    'sexualEducation',
    'medicalAndAnatomicalContent',
    'art',
    'healthDiscussion',
    'nonSexualNudityInContext',
  ],
  corpusPhrases: [
    'absence of the required presentation conditions',
    'sexual education · medical and anatomical content · art · health discussion · non-sexual nudity in cultural, artistic or medical context',
    // ⚠ Quote a run of PLAIN text. "Explicitness is a topic" is not a substring
    // of the corpus: the word `topic` is bolded, so the markdown splits it.
    'the explicitness of the content',
  ],
  decisiveSource:
    'Whether the required presentation conditions are absent — see presentationEvidence.ts. Nothing supplies the required set today, so it stays undetermined.',
});

/**
 * #15 `ts.animal.cruelty` — PROHIBITED, ORDINARY. The control policy (P2).
 *
 * 🚨 `carveOuts` IS EMPTY, AND THAT IS THE WHOLE POINT. The nine `Does not
 * govern` items — slaughter for food, traditional and cultural food practices,
 * farming, fishing and hunting, veterinary procedures, pest control, wildlife
 * documentary, conservation and education, religious practice — are legitimate
 * PURPOSES, and the constitutive element is "gratuitousness relative to
 * purpose". Treating a recognised purpose as an independent carve-out would
 * acquit the exact case the corpus says is real: "slaughter conducted with
 * suffering materially beyond the purpose can constitute it."
 *
 * So a recognised purpose does NOT clear the content here. It leaves the
 * question open, which is what the corpus demands: "The boundary is real and
 * requires human judgement, not a keyword."
 *
 * 🔑 CTX-2 applies with force: "Vietnamese food practices unfamiliar to a model
 * or reviewer are, on that ground alone, not evidence of cruelty." And TOP-1:
 * "animal is a topic and can never constitute this policy."
 *
 * ⚠ CONSEQUENCE, STATED PLAINLY: pig slaughter, balut and veterinary surgery all
 * return UNDETERMINED here, not "cleared". The UAT bed expects NOT_APPLICABLE
 * for those, because the CORPUS settles them directly (§18 cases 2 and 3) — a
 * detector cannot. Reporting UNDETERMINED is the conservative answer and the
 * mandated one; reporting NOT_APPLICABLE would be a judgement no evidence
 * supports, and reporting a violation would be the keyword failure the corpus
 * forbids by name.
 */
export const ANIMAL_CRUELTY: PolicyConstitution = Object.freeze({
  ref: 'ts.animal.cruelty@1',
  decisive: 'sufferingMateriallyExceedsPurpose',
  carveOuts: [],
  corpusPhrases: [
    'gratuitousness relative to purpose',
    'slaughter for food · traditional and cultural food practices · farming and animal husbandry · fishing and hunting · veterinary and medical procedures · pest control · wildlife documentary · conservation and education · religious practice involving animals',
    'requires human judgement, not a keyword',
    // ⚠ Same trap: "not evidence of cruelty" spans a bolded `**not**`.
    'Vietnamese food practices unfamiliar to a model or reviewer',
  ],
  decisiveSource:
    'Whether suffering materially exceeds a legitimate purpose. The corpus states this requires human judgement; nothing in this product establishes it.',
});

/** Every policy with a detector in this module. P1 lives in its own frozen module. */
export const IMPLEMENTED_POLICIES: readonly PolicyConstitution[] = Object.freeze([
  GRAPHIC_HARM,
  HARMFUL_ACTIVITY,
  GRAPHIC_PRESENTATION,
  ADULT_CONTENT,
  ANIMAL_CRUELTY,
]);

/**
 * Absence of engagement — the missing half of the evidence model.
 *
 * ============================================================================
 * THE PROBLEM THIS SOLVES
 * ============================================================================
 * Every policy answered `INSUFFICIENT_EVIDENCE` for every post, including a bowl
 * of noodles on a table. Not because anything was detected — because nothing
 * was, and the engine had no way to say so.
 *
 * `constitutedFrom` reads one signal per policy and distinguishes three answers:
 *
 *   `true`       the decisive element is established        → VIOLATION path
 *   `false`      the decisive element is established ABSENT → NOT_APPLICABLE
 *   `undefined`  nothing was established                    → INSUFFICIENT_EVIDENCE
 *
 * The mapping layer only ever produced `true` (for P1) or `undefined`. It never
 * produced `false`, so `NOT_APPLICABLE` — the one non-blocking outcome an
 * ordinary post could reach — was unreachable by construction.
 *
 * That is the whole bug. It is not that the policies are too strict; it is that
 * "we looked and this policy is not in play" had no representation.
 *
 * ============================================================================
 * WHY WRITING `false` IS SAFE HERE, AND ONLY HERE
 * ============================================================================
 * `constitution.ts` states the danger plainly: "A detector that writes `false`
 * for something it merely did not check manufactures findings silently." So the
 * only honest licence to write `false` is having actually checked.
 *
 * Two conditions, both required, neither sufficient alone:
 *
 *   1. EXAMINATION COMPLETE — every modality that can run, ran and observed; and
 *      there is no safety-critical part of this item that went unexamined. For a
 *      photo the frame IS the content. For a video it is not: the poster frame is
 *      one frame of thousands, and the audio is not heard at all, so a video can
 *      never be COMPLETE in this build.
 *
 *   2. NO INDICATOR — nothing observed anywhere in caption, hashtags, on-screen
 *      text or frame subjects raises this particular policy.
 *
 * 🚨 TOP-1 IS NOT WEAKENED. An indicator never constitutes a violation and never
 * causes a block. Its ONLY effect is to withhold the absence assertion, which
 * sends the item to review. Topics still cannot establish a policy; they can now
 * stop us from claiming a policy is absent. That is strictly the safe direction:
 * every indicator makes the system MORE cautious, never less.
 *
 * The asymmetry is deliberate and total — this module can move a policy from
 * "blocking (unknown)" to "not applicable", and can never move one toward
 * violation.
 */

import { observationsIn, resultFor, type EvidenceBundle } from '../evidence/types';

// ---------------------------------------------------------------------------
// Examination completeness
// ---------------------------------------------------------------------------

export type ExaminationLevel = 'COMPLETE' | 'INCOMPLETE' | 'FAILED';

export interface ExaminationVerdict {
  readonly level: ExaminationLevel;
  /** Operator-facing, never content and never an accusation. */
  readonly reason: string;
}

/** A descriptor the metadata modality emits, e.g. `contentType:video`. */
function descriptorValue(bundle: EvidenceBundle, prefix: string): string | undefined {
  for (const o of observationsIn(bundle))
    for (const d of o.descriptors ?? []) if (d.startsWith(prefix)) return d.slice(prefix.length);
  return undefined;
}

/**
 * Was this item examined well enough that "we saw nothing" means something?
 *
 * Ordered so the most conservative answer wins. Note that `UNAVAILABLE` on
 * IMAGE_FRAME is only acceptable when the item genuinely carries no media —
 * a post WITH media whose frame could not be read is INCOMPLETE, never COMPLETE.
 */
export function examinationOf(bundle: EvidenceBundle): ExaminationVerdict {
  if (bundle.results.some((r) => r.status === 'FAILED'))
    return { level: 'FAILED', reason: 'a modality failed; nothing can be concluded from silence' };

  const text = resultFor(bundle, 'TEXT');
  const metadata = resultFor(bundle, 'METADATA');
  if (text?.status !== 'OBSERVED' || metadata?.status !== 'OBSERVED')
    return { level: 'FAILED', reason: 'the always-available modalities did not both observe' };

  const contentType = descriptorValue(bundle, 'contentType:');
  const mediaPresent = descriptorValue(bundle, 'mediaPresent:') === 'true';
  const frame = resultFor(bundle, 'IMAGE_FRAME');

  // A video is never fully examined in this build: VIDEO_FRAMES and AUDIO_SPEECH
  // are both UNAVAILABLE, so most of the item was never seen or heard. This is
  // the honest, load-bearing limitation — see EXPLORE_CONTENT_POLICY.md §6.
  if (contentType === 'video')
    return {
      level: 'INCOMPLETE',
      reason: 'video: frames across the clip and audio are not examined in this build',
    };

  if (mediaPresent && frame?.status !== 'OBSERVED')
    return { level: 'INCOMPLETE', reason: 'the item carries media that was not examined' };

  return {
    level: 'COMPLETE',
    reason: mediaPresent
      ? 'caption, metadata and the item’s image were all examined'
      : 'the item carries no media; its text and metadata were fully examined',
  };
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

/**
 * Observable terms that keep a policy's question OPEN.
 *
 * Read the contract carefully, because it is the opposite of a blocklist:
 * matching a term here does NOT block, flag, or count toward any violation. It
 * only prevents this module from asserting that the policy is absent, which
 * routes the item to review instead of publication.
 *
 * 🚨 NOT AN INDICATOR, DELIBERATELY: politics, religion, government, election,
 * protest, church, mosque, temple, party, activism, and every other topic word.
 * Those are subject matter. A political or religious post is an ordinary post
 * and must reach the same outcome as any other — asserted by test. Only
 * harm-shaped observations appear below.
 *
 * Terms are matched case-insensitively as substrings against the observable
 * surface. Over-matching is acceptable and under-matching is not: a false match
 * costs a review, a missed one would cost a wrong publication.
 */
export interface PolicyIndicator {
  readonly policy: string;
  /** The signal name `constitutedFrom` reads for this policy. */
  readonly decisive: string;
  readonly terms: readonly string[];
}

export const POLICY_INDICATORS: readonly PolicyIndicator[] = Object.freeze([
  {
    policy: 'ts.violence.graphic-harm',
    decisive: 'glorificationOrShockPrimacy',
    terms: ['blood', 'máu', 'gore', 'wound', 'vết thương', 'corpse', 'xác chết', 'dead body',
      'mutilat', 'stab', 'đâm', 'beating', 'đánh đập', 'injury', 'chấn thương'],
  },
  {
    policy: 'ts.violence.incitement-threats',
    decisive: 'credibleThreatAgainstIdentifiableTargetEstablished',
    terms: ['kill', 'giết', 'threat', 'đe dọa', 'shoot', 'bắn', 'bomb', 'bom', 'attack',
      'tấn công', 'gun', 'súng', 'weapon', 'vũ khí', 'knife', 'dao'],
  },
  {
    policy: 'ts.selfharm.promotion',
    decisive: 'promotionOrInstructionDirectedAtOthers',
    terms: ['suicide', 'tự tử', 'self-harm', 'self harm', 'tự hại', 'cutting', 'rạch tay',
      'overdose', 'kết liễu'],
  },
  {
    policy: 'ts.danger.harmful-activity',
    decisive: 'presentedAsEncouragementToImitate',
    terms: ['challenge', 'thử thách', 'stunt', 'dangerous', 'nguy hiểm', 'explosion', 'nổ',
      'fire', 'lửa', 'cliff', 'vách đá', 'drug', 'ma túy', 'poison', 'chất độc'],
  },
  {
    policy: 'ts.animal.cruelty',
    decisive: 'sufferingMateriallyExceedsPurpose',
    terms: ['slaughter', 'giết mổ', 'animal abuse', 'ngược đãi', 'hunting', 'săn bắn',
      'cockfight', 'chọi gà', 'bullfight'],
  },
  {
    policy: 'ts.child.sexual-exploitation',
    decisive: 'sexualExploitationOfMinorEstablished',
    terms: ['child', 'trẻ em', 'minor', 'vị thành niên', 'kid', 'teen', 'thiếu niên',
      'nude', 'khoả thân', 'naked', 'sexual', 'tình dục', 'sex'],
  },
  {
    policy: 'ts.child.sexualization',
    decisive: 'sexualisedPresentationOfMinorEstablished',
    terms: ['child', 'trẻ em', 'minor', 'vị thành niên', 'kid', 'teen', 'thiếu niên',
      'nude', 'khoả thân', 'naked', 'sexual', 'tình dục', 'sex', 'lingerie', 'đồ lót'],
  },
  {
    policy: 'ts.child.grooming',
    decisive: 'exploitativeTrustPatternEstablished',
    terms: ['child', 'trẻ em', 'minor', 'vị thành niên', 'kid', 'teen', 'thiếu niên'],
  },
  {
    policy: 'ts.child.abuse-harm',
    decisive: 'abuseOrEndangermentOfMinorEstablished',
    terms: ['child', 'trẻ em', 'minor', 'vị thành niên', 'kid', 'teen', 'thiếu niên',
      'abuse', 'bạo hành'],
  },
  {
    policy: 'ts.sexual.exploitation-nonconsent',
    decisive: 'nonConsensualSexualConductEstablished',
    terms: ['nude', 'khoả thân', 'naked', 'sexual', 'tình dục', 'sex', 'porn', 'khiêu dâm',
      'lingerie', 'đồ lót', 'revenge', 'trả thù', 'leak', 'lộ clip'],
  },
  {
    policy: 'ts.harassment.targeted',
    decisive: 'abuseDirectedAtIdentifiablePersonEstablished',
    terms: ['idiot', 'ngu', 'stupid', 'ugly', 'xấu xí', 'harass', 'quấy rối', 'insult',
      'lăng mạ', 'bully', 'bắt nạt', 'disgusting', 'kinh tởm'],
  },
  {
    policy: 'ts.deception.harmful',
    decisive: 'allFourDeceptionElementsEstablished',
    terms: ['guaranteed', 'cam kết 100', 'miracle', 'thần dược', 'cure', 'chữa khỏi',
      'investment', 'đầu tư', 'lợi nhuận', 'profit'],
  },
  {
    policy: 'ts.fraud.scam',
    decisive: 'deceptiveSchemeForGainEstablished',
    terms: ['scam', 'lừa đảo', 'free money', 'tiền miễn phí', 'crypto', 'airdrop',
      'chuyển khoản', 'transfer money', 'winner', 'trúng thưởng', 'lô đề'],
  },
  {
    policy: 'ts.platform.abuse-manipulation',
    decisive: 'coordinatedInauthenticBehaviourEstablished',
    terms: ['follow4follow', 'sub4sub', 'tăng follow', 'buy followers', 'mua like',
      'bot', 'spam'],
  },
]);

/**
 * The text and subjects the pipeline actually observed, as one lowercase string.
 *
 * Both caption text and what the vision modality read off the frame are included,
 * because an indicator burned into an image matters exactly as much as one typed
 * into the caption.
 */
export function observableSurface(bundle: EvidenceBundle): string {
  const parts: string[] = [];
  for (const o of observationsIn(bundle)) {
    if (o.recognisedText) parts.push(o.recognisedText);
    for (const d of o.descriptors ?? []) if (!d.includes(':')) parts.push(d);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Words in the surface, Unicode-aware so Vietnamese survives tokenisation.
 *
 * 🚨 Naive substring matching is wrong here, and measurably so: `ngu` is inside
 * `nguội`, so "đồ ăn nguội" — cold food, the single most ordinary complaint on a
 * restaurant review platform — matched a harassment indicator and sent every
 * negative review to moderation. Matching on token boundaries fixes that class
 * of collision rather than that one word.
 */
function tokensOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

/**
 * Does anything observed keep this policy's question open?
 *
 * A multi-word term is matched as a phrase. A single word must match a whole
 * token, except that a term of five characters or more may also match a token
 * prefix, so `harass` still finds `harassment` while `ngu` cannot find `nguội`.
 */
export function indicatorsPresentFor(policy: string, surface: string, captionText = ''): boolean {
  const entry = POLICY_INDICATORS.find((p) => p.policy === policy);
  if (!entry) return true; // a policy with no declared indicators is never asserted absent

  const haystack = `${surface} ${captionText}`.toLowerCase();
  const tokens = tokensOf(haystack);

  return entry.terms.some((raw) => {
    const term = raw.toLowerCase();
    if (/[^\p{L}\p{N}]/u.test(term)) return haystack.includes(term);
    if (tokens.has(term)) return true;
    return term.length >= 5 && [...tokens].some((t) => t.startsWith(term));
  });
}

// ---------------------------------------------------------------------------
// The signal
// ---------------------------------------------------------------------------

/**
 * `{ [decisive]: false }` when — and only when — absence is genuinely established.
 *
 * Returns `{}` in every other case, which leaves the policy exactly where it was:
 * `undefined` → `INSUFFICIENT_EVIDENCE` → held. There is no path through this
 * function that makes a policy more likely to be violated, and none that publishes
 * anything a failed or incomplete examination touched.
 */
export function absenceSignalFor(
  policy: string,
  bundle: EvidenceBundle,
  captionText = '',
): Record<string, false> {
  const entry = POLICY_INDICATORS.find((p) => p.policy === policy);
  if (!entry) return {};

  if (examinationOf(bundle).level !== 'COMPLETE') return {};
  if (indicatorsPresentFor(policy, observableSurface(bundle), captionText)) return {};

  return { [entry.decisive]: false };
}

/** Policies this module can currently establish absence for. */
export const ABSENCE_CAPABLE_POLICIES: readonly string[] = POLICY_INDICATORS.map((p) => p.policy);

/**
 * The evidence pipeline — gather everything that can be gathered about one
 * version of one item, and say plainly what could not be.
 */

import { contentVersionFrom } from '@/lib/policy/explore/contentClassification';

import {
  audioSpeechEvidence,
  imageFrameEvidence,
  metadataEvidence,
  textEvidence,
  videoFramesEvidence,
} from './modalities';
import { MODALITIES, type EvidenceBundle, type ModalityResult } from './types';

/**
 * The item as the platform holds it.
 *
 * 🚨 `user_id` and engagement counters are deliberately absent. Identity must not
 * travel with a safety evaluation, and a counter would make the content
 * fingerprint churn on every like — which would invalidate evidence for reasons
 * that have nothing to do with the content changing.
 */
export interface SafetySubject {
  readonly id: string;
  readonly body?: unknown;
  readonly hashtags?: unknown;
  readonly place_name?: unknown;
  readonly place_address?: unknown;
  readonly content_type?: unknown;
  readonly source_type?: unknown;
  readonly media_url?: unknown;
  readonly thumbnail?: unknown;
}

/**
 * The fingerprint of the fields the pipeline examines.
 *
 * Evidence belongs to this value. An edit to any examined field produces a
 * different fingerprint, which is what stops old evidence from authorising the
 * publication of new content.
 */
export function safetyContentVersion(subject: SafetySubject): string {
  return contentVersionFrom({
    body: typeof subject.body === 'string' ? subject.body : '',
    hashtags: Array.isArray(subject.hashtags) ? subject.hashtags.join(' ') : '',
    media_url: typeof subject.media_url === 'string' ? subject.media_url : '',
    thumbnail: typeof subject.thumbnail === 'string' ? subject.thumbnail : '',
  });
}

/**
 * The frame the pipeline examines.
 *
 * A video's poster frame is a real frame of the real media, and for a photo post
 * the image itself is the media. Neither is a substitute for sampling the whole
 * video — that gap is reported by `VIDEO_FRAMES`, not papered over here.
 */
function frameUrlOf(subject: SafetySubject): unknown {
  if (typeof subject.thumbnail === 'string' && subject.thumbnail.trim()) return subject.thumbnail;
  if (subject.content_type === 'photo' && typeof subject.media_url === 'string') return subject.media_url;
  return '';
}

/**
 * Run every modality.
 *
 * TOTAL BY CONSTRUCTION. Each modality already returns rather than throws; this
 * adds a second net so an unforeseen failure becomes a `FAILED` result for that
 * modality instead of an exception that loses the whole bundle.
 *
 * Every modality appears in the output exactly once, in a fixed order, whether
 * it ran or not — so a reader can never mistake an absent slot for a clean one.
 */
export async function gatherEvidence(
  subject: SafetySubject,
  gatheredAt: string,
): Promise<EvidenceBundle> {
  const results: ModalityResult[] = [];

  const guard = async (
    modality: (typeof MODALITIES)[number],
    run: () => ModalityResult | Promise<ModalityResult>,
  ): Promise<void> => {
    try {
      results.push(await run());
    } catch {
      results.push({ modality, status: 'FAILED', reason: 'modality threw' });
    }
  };

  await guard('TEXT', () => textEvidence(subject));
  await guard('METADATA', () => metadataEvidence(subject));
  await guard('IMAGE_FRAME', () => imageFrameEvidence({ imageUrl: frameUrlOf(subject) }));
  await guard('VIDEO_FRAMES', () => videoFramesEvidence());
  await guard('AUDIO_SPEECH', () => audioSpeechEvidence());

  return {
    contentId: subject.id,
    contentVersion: safetyContentVersion(subject),
    gatheredAt,
    results,
  };
}

/**
 * Is this bundle still about the item as it exists now?
 *
 * A stale bundle is not downgraded to "safe" and not upgraded to "suspect". It
 * is simply about something else, and the honest response is to gather again.
 */
export function evidenceIsStale(bundle: EvidenceBundle, currentVersion: string): boolean {
  return bundle.contentVersion !== currentVersion;
}

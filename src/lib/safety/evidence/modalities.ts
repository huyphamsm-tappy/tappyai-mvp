/**
 * The five evidence modalities: three that run, two that cannot yet.
 *
 * Each returns a `ModalityResult` and never throws. A modality that breaks
 * reports `FAILED`; a modality this product does not have reports `UNAVAILABLE`
 * with the reason. Neither is ever silently turned into "observed nothing".
 */

import { AI } from '@/lib/ai/llm';

import {
  type Modality,
  type ModalityResult,
  type ModalityObserved,
} from './types';

// ---------------------------------------------------------------------------
// Shared identifier extraction
// ---------------------------------------------------------------------------

/**
 * Vietnamese phone shapes and e-mail addresses.
 *
 * The digit-boundary guard is load-bearing: without the leading `(?<!\d)` a
 * price like `100.000.000đ` reads as a phone number. Deliberately conservative —
 * a detector that cries wolf inflates the "cannot tell" rate, which is the
 * metric this whole pipeline exists to move.
 */
const PHONE_PATTERN = /(?<!\d)(?:\+84|0)(?:[\s.\-]?\d){8,10}(?!\d)/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Contact-shaped strings in a piece of text, normalised for comparison. */
export function contactIdentifiersIn(text: string): string[] {
  const found = [...text.matchAll(PHONE_PATTERN), ...text.matchAll(EMAIL_PATTERN)].map((m) =>
    normalise(m[0]),
  );
  return [...new Set(found)].filter((v) => v.length > 0);
}

// ---------------------------------------------------------------------------
// TEXT — the caption the author supplied
// ---------------------------------------------------------------------------

export interface TextInput {
  readonly body?: unknown;
  readonly hashtags?: unknown;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(' ');
  return '';
}

/**
 * 🚨 The filename is NOT an input here, and must never become one. A name is
 * chosen by the uploader and describes nothing about the content; treating it as
 * evidence is how a rename becomes a safety signal.
 */
export function textEvidence(input: TextInput): ModalityResult {
  try {
    const text = `${asText(input.body)} ${asText(input.hashtags)}`.trim();
    return {
      modality: 'TEXT',
      status: 'OBSERVED',
      contactIdentifiers: contactIdentifiersIn(text),
      // The caption itself, so what the author wrote is part of the observable
      // surface rather than only a source of contact identifiers. Without this a
      // written threat is invisible to everything downstream — the caption was
      // read for phone numbers and then discarded.
      recognisedText: text,
    };
  } catch {
    return { modality: 'TEXT', status: 'FAILED', reason: 'text extraction threw' };
  }
}

// ---------------------------------------------------------------------------
// METADATA — structured facts the platform already holds
// ---------------------------------------------------------------------------

export interface MetadataInput {
  readonly place_name?: unknown;
  readonly place_address?: unknown;
  readonly content_type?: unknown;
  readonly source_type?: unknown;
  /**
   * Read ONLY to answer "does this item carry media at all", never for its value.
   * The completeness check needs to tell a text-only post (nothing to look at, so
   * an unavailable frame is honest) from a post whose media could not be read
   * (something to look at that we did not) — and those are indistinguishable from
   * the frame result alone.
   */
  readonly media_url?: unknown;
  readonly thumbnail?: unknown;
}

/**
 * Descriptors only — never a judgement. `businessContact:<id>` records that a
 * contact string belongs to the place the post is about, which is a fact the
 * row already carries, not an inference about the author's intent.
 */
export function metadataEvidence(input: MetadataInput): ModalityResult {
  try {
    const placeText = `${asText(input.place_name)} ${asText(input.place_address)}`;
    const descriptors: string[] = [];
    if (typeof input.content_type === 'string' && input.content_type)
      descriptors.push(`contentType:${input.content_type}`);
    if (typeof input.source_type === 'string' && input.source_type)
      descriptors.push(`sourceType:${input.source_type}`);
    // Presence only — never the URL, which carries an uploader-chosen filename.
    const hasMedia =
      (typeof input.media_url === 'string' && input.media_url.trim().length > 0) ||
      (typeof input.thumbnail === 'string' && input.thumbnail.trim().length > 0);
    descriptors.push(`mediaPresent:${hasMedia}`);
    for (const id of contactIdentifiersIn(placeText)) descriptors.push(`businessContact:${id}`);
    return { modality: 'METADATA', status: 'OBSERVED', descriptors, contactIdentifiers: [] };
  } catch {
    return { modality: 'METADATA', status: 'FAILED', reason: 'metadata extraction threw' };
  }
}

// ---------------------------------------------------------------------------
// IMAGE_FRAME — the one modality that actually looks at the media
// ---------------------------------------------------------------------------

/**
 * What the model is asked. Read this carefully, because it is the whole safety
 * argument for using a model at all:
 *
 * 🚨 IT IS NEVER ASKED WHETHER SOMETHING VIOLATES A POLICY. It is asked to
 * transcribe text it can see and to name plainly visible subject matter. Asking
 * a model for a verdict would let it author policy, which the corpus reserves to
 * the taxonomy and the Owner. Observations come back here; what they are worth
 * is decided by the mapping layer against the corpus.
 *
 * The requested shape is deliberately dull and bounded.
 */
export const FRAME_OBSERVATION_PROMPT = [
  'Describe only what is literally visible in this image. Do not judge it, do not',
  'rate it, and do not say whether it is appropriate.',
  '',
  'Reply with exactly two lines:',
  'TEXT: <every piece of text visible in the image, verbatim, or NONE>',
  'SUBJECTS: <up to six short comma-separated nouns for what is depicted, or NONE>',
].join('\n');

export interface ImageFrameInput {
  /** URL of the poster frame or photo. A real frame of the real media. */
  readonly imageUrl?: unknown;
}

/** Parses the two-line reply. Anything unparsable yields no observation, not a guess. */
export function parseFrameObservation(reply: string): {
  recognisedText: string;
  descriptors: string[];
} {
  const textLine = /^TEXT:\s*(.*)$/im.exec(reply)?.[1]?.trim() ?? '';
  const subjectsLine = /^SUBJECTS:\s*(.*)$/im.exec(reply)?.[1]?.trim() ?? '';
  const recognisedText = /^none$/i.test(textLine) ? '' : textLine;
  const descriptors = /^none$/i.test(subjectsLine)
    ? []
    : subjectsLine
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6);
  return { recognisedText, descriptors };
}

/**
 * Look at one frame.
 *
 * Total: a network failure, a model failure or a malformed reply all end as
 * `FAILED`, never as an empty observation. The difference matters — an empty
 * observation would tell the gate "we looked and the frame is clean".
 */
export async function imageFrameEvidence(input: ImageFrameInput): Promise<ModalityResult> {
  const url = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  if (!url) {
    return {
      modality: 'IMAGE_FRAME',
      status: 'UNAVAILABLE',
      reason: 'the item carries no poster frame or image to examine',
    };
  }
  if (!/^https:\/\//i.test(url)) {
    return {
      modality: 'IMAGE_FRAME',
      status: 'UNAVAILABLE',
      reason: 'image reference is not an https URL and was not fetched',
    };
  }

  try {
    const { text } = await AI.vision({
      image: url,
      prompt: FRAME_OBSERVATION_PROMPT,
      maxTokens: 300,
    });
    const { recognisedText, descriptors } = parseFrameObservation(text ?? '');
    const observed: ModalityObserved = {
      modality: 'IMAGE_FRAME',
      status: 'OBSERVED',
      recognisedText,
      descriptors,
      contactIdentifiers: contactIdentifiersIn(recognisedText),
    };
    return observed;
  } catch {
    // Failure class only. The URL, the reply and the error text are all withheld
    // deliberately: none of them may reach a log.
    return { modality: 'IMAGE_FRAME', status: 'FAILED', reason: 'vision call failed' };
  }
}

// ---------------------------------------------------------------------------
// The two modalities this product does not have
// ---------------------------------------------------------------------------

/**
 * Sampling frames across a video needs a decoder. There is none: the app runs on
 * serverless/edge and ships no ffmpeg, and media is stored, not processed.
 *
 * The slot exists so the gap is visible in every result rather than being
 * something a reader has to notice is missing.
 */
export function videoFramesEvidence(): ModalityResult {
  return {
    modality: 'VIDEO_FRAMES',
    status: 'UNAVAILABLE',
    reason: 'no video decoder in this runtime; only the poster frame can be examined',
  };
}

/** Speech needs a transcription capability. The repository has none. */
export function audioSpeechEvidence(): ModalityResult {
  return {
    modality: 'AUDIO_SPEECH',
    status: 'UNAVAILABLE',
    reason: 'no speech-to-text capability is configured',
  };
}

/** Modalities that are implemented today, for reporting and for tests. */
export const SUPPORTED_MODALITIES: readonly Modality[] = ['TEXT', 'METADATA', 'IMAGE_FRAME'];
export const UNSUPPORTED_MODALITIES: readonly Modality[] = ['VIDEO_FRAMES', 'AUDIO_SPEECH'];

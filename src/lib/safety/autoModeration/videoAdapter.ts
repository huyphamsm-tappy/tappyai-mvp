// The clip moderation step (src/lib/media/video/moderationStep.ts) was written around one provider answer shape: per-category flags and 0..1 scores. This adapter gives it the SAME shape from the
// Vietnam-law filter of this folder (deterministic phrases + one model call, fail-closed), so a clip's frames, speech transcript and overlay text are judged by the SAME rules as every comment,
// post and picture, and without any dependency on a third-party moderation endpoint.
//
// Mapping of our categories onto the names the clip policy already reasons about (moderationPolicy.ts):
//   sexual_explicit -> sexual            child_safety -> sexual/minors (SEVERE: urgent hold, never decided by the machine)
//   violence_terror -> violence/graphic  division_hate -> hate/threatening     everything else keeps its own name.
// A score is the model's confidence when it says "block", 0 when it says "allow". A phrase hit scores 1. A category is FLAGGED when its score reaches the category's block threshold.
import type { ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'
import { classifyImage, classifyText, type TextClassification } from './classifier'
import { BLOCK_THRESHOLD } from './gate'
import { scanLexicon, type ModerationCategory } from './lexicon'

export const CATEGORY_NAME: Record<ModerationCategory, string> = {
  sexual_explicit: 'sexual',
  child_safety: 'sexual/minors',
  violence_terror: 'violence/graphic',
  division_hate: 'hate/threatening',
  anti_state: 'anti_state',
  misinformation: 'misinformation',
  scam_fraud: 'scam_fraud',
  gambling: 'gambling',
  drugs: 'drugs',
  defamation_privacy: 'defamation_privacy',
}

export const VIDEO_FILTER_MODEL = 'vn-filter-1'

function outcomeOf(scoresByCategory: Partial<Record<ModerationCategory, number>>): ModerationOutcome {
  const categories: Record<string, boolean> = {}
  const scores: Record<string, number> = {}
  for (const c of Object.keys(CATEGORY_NAME) as ModerationCategory[]) {
    const s = scoresByCategory[c] ?? 0
    scores[CATEGORY_NAME[c]] = s
    categories[CATEGORY_NAME[c]] = s >= BLOCK_THRESHOLD[c]
  }
  return { status: 'ok', categories, scores }
}

function fromClassification(r: TextClassification): ModerationOutcome {
  if (r.status !== 'ok') return { status: 'unavailable', reason: 'failed' }
  if (r.verdict === 'block' && r.category === 'none') return { status: 'unavailable', reason: 'bad_answer' } // a "block" nobody could name is not evidence
  return outcomeOf(r.verdict === 'block' && r.category !== 'none' ? { [r.category]: r.confidence } : {})
}

export interface VideoAdapterDeps {
  classifyText?: (text: string) => Promise<TextClassification>
  classifyImage?: (bytes: Uint8Array, mime: string) => Promise<TextClassification>
}

/** Frames (the sprite sheet of six frames). */
export async function moderateImageVn(bytes: Uint8Array, mime: string, deps: VideoAdapterDeps = {}): Promise<ModerationOutcome> {
  return fromClassification(await (deps.classifyImage ?? classifyImage)(bytes, mime))
}

/** Speech transcript pieces and overlay text. Phrase hits first (score 1, no model call); otherwise one model call over everything, so the cost of a clip is bounded. */
export async function moderateTextVn(texts: string[], deps: VideoAdapterDeps = {}): Promise<ModerationOutcome> {
  const pieces = texts.filter((t) => typeof t === 'string' && t.trim() !== '')
  if (pieces.length === 0) return { status: 'unavailable', reason: 'bad_answer' }
  const hits: Partial<Record<ModerationCategory, number>> = {}
  for (const p of pieces) for (const h of scanLexicon(p)) hits[h.category] = 1
  if (Object.keys(hits).length > 0) return outcomeOf(hits)
  // The classifier reads 4000 characters per call: a long transcript is judged in parts, ALL of them (at most 12), and a category counts at its highest score in any part.
  const joined = pieces.join('\n')
  const parts: string[] = []
  for (let i = 0; i < joined.length && parts.length < MAX_PARTS; i += PART_CHARS) parts.push(joined.slice(i, i + PART_CHARS))
  if (joined.length > MAX_PARTS * PART_CHARS) return { status: 'unavailable', reason: 'bad_answer' } // too long to judge in full is not judged at all
  const best: Partial<Record<ModerationCategory, number>> = {}
  for (const part of parts) {
    const r = await (deps.classifyText ?? classifyText)(part)
    const o = fromClassification(r)
    if (o.status !== 'ok') return o
    if (r.status === 'ok' && r.verdict === 'block' && r.category !== 'none') best[r.category] = Math.max(best[r.category] ?? 0, r.confidence)
  }
  return outcomeOf(best)
}

const PART_CHARS = 4000
const MAX_PARTS = 12

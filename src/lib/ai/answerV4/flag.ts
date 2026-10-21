// TAPPY_ANSWER_V4 (owner 19/10/2026: "Tappy phải nhận dạng được câu hỏi… format & layout giống ChatGPT… như đang đọc báo"). Default OFF.
// On top of CONSULT_V3: the question is understood by ONE structured model call (any language, any phrasing — no keyword routing), the answer
// is laid out as a document with pictures resolved by the server, and quality guards annotate instead of deleting sentences.
// Kept outside src/lib/ai/agent so tool and UI modules can read it without importing the agent loop.
import { consultV3Enabled } from '@/lib/ai/consultV3Flag'

export function answerV4Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.TAPPY_ANSWER_V4 ?? '').trim().toLowerCase()
  return (v === '1' || v === 'true' || v === 'on') && consultV3Enabled(env)
}

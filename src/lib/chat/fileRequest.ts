// "Export this to a file" (owner 20/11/2026, after a real run in the browser): a person who asks for a file ("xuất ra file", "tải về PDF", "export as a PDF") must get the download buttons under the
// answer, whatever its length. Until now the bar appeared only under a long, many-section report, so a one-page report with "xuất file" in the question got no file at all. Pure; decided from the
// person's own words, never from the model's, and the files are built in the browser from the answer text (ReportExportBar).
import { normalizeVietnamese } from '@/lib/chat/workspace/historyModel'
import { looksLikeReport } from './requestHistory'

const FILE = '(?:file|tep|pdf|word|docx|markdown)'
const VERB_VI = '(?:xuat|tai ve|tai xuong|luu thanh|luu ra|gui)'
const VERB_EN = '(?:export|download|save)'
const NEAR = '[^.?!\\n]{0,40}'
const PATTERNS: RegExp[] = [
  new RegExp(`\\b${VERB_VI}\\b${NEAR}\\b${FILE}\\b`),
  new RegExp(`\\b${FILE}\\b${NEAR}\\b(?:tai ve|tai xuong|xuat)\\b`),
  new RegExp(`\\b${VERB_EN}\\b${NEAR}\\b(?:${FILE}|report)\\b`),
  new RegExp(`\\b(?:download|save)\\b${NEAR}\\b(?:as|to) (?:a )?file\\b`),
  new RegExp(`\\bcho (?:minh|toi|em|tui|to|anh|chi) (?:mot |1 )?${FILE}\\b`),
]

/** Did the person ask for the answer as a file? */
export function wantsFileExport(text: string): boolean {
  const t = normalizeVietnamese(text ?? '').toLowerCase()
  return t.length > 0 && PATTERNS.some(p => p.test(t))
}

/** Under a finished assistant answer: the download bar shows for a long report (the old rule), or when the person asked for a file and the answer is a real one (not a short refusal or a question back). */
export function showsExportBar(o: { answer: string; previousUserText: string; streaming: boolean }): boolean {
  if (o.streaming) return false
  if (looksLikeReport(o.answer)) return true
  return o.answer.length >= 400 && wantsFileExport(o.previousUserText)
}

/**
 * Owner 20/11/2026 (approved): on a turn where the person asks for a file, ONE line tells the model the app draws the download buttons under its answer, so it writes the document and does not open
 * with "I cannot attach a file" (seen in a real run, next to the buttons it could not see). Empty on every other turn: nothing is added to the model's context unless a file was asked for.
 */
export function fileExportNoteFor(userText: string): string {
  if (!wantsFileExport(userText)) return ''
  return 'The app shows Markdown, Word and PDF download buttons under your answer when the person asks for a file. Do not say you cannot attach or send a file: write the document in full as your answer.'
}

// Attachment policy (R13 §3.2.3, §17.7): what an upload may be, judged from its BYTES, and the rules for a request that is only an attachment. Pure; no I/O.
//   sniffKind()          — what the bytes are (magic bytes), never what the extension or the client's Content-Type says;
//   classifyAttachment() — P0 types only; a declared type that disagrees with the bytes is refused;
//   imagePreflight()     — decoded width/height/pixels/aspect checked BEFORE any Vision dispatch (a tiny file can still be 1000x20000);
//   implicitAttachmentTask() — text empty + an authorized attachment = the server-owned task DESCRIBE_OR_SUMMARIZE_ATTACHMENT, stream GENERAL_KNOWLEDGE, no side effects.
// Contents of an attachment (OCR, EXIF, QR, file text) are untrusted data, never instructions: nothing here lets them reach a system or developer prompt.
// Not wired into the chat route or the upload routes yet; the existing image/PDF limits there keep applying.

export const ATTACHMENT_POLICY_VERSION = 'attachment-policy.v1'

export type SniffedKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | 'pdf' | 'zip' | 'text' | 'unknown'

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

/** The kind of the bytes by their signature. `text` = valid UTF-8 with no NUL in the first 8 KiB. Pure. */
export function sniffKind(bytes: Uint8Array): SniffedKind {
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'gif'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp'
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(bytes, 8, 12))) return 'heic'
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'pdf'
  if (bytes.length >= 4 && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip'
  const head = bytes.subarray(0, 8192)
  if (head.length > 0 && !head.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(head); return 'text' } catch {
      // only a character cut by the 8 KiB window itself (the file goes on past it) is forgiven; invalid UTF-8 anywhere else is binary
      if (bytes.length <= head.length) return 'unknown'
      try { new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, head.length - 3)); return 'text' } catch { return 'unknown' }
    }
  }
  return 'unknown'
}

export type AttachmentFamily = 'image' | 'pdf' | 'office' | 'text'

/** P0 families (R13 §17.7). Office files are ZIP containers: the sniffer says `zip`, and the extension then only chooses among the three Office kinds (see classifyAttachment). */
const IMAGE_KINDS: readonly SniffedKind[] = ['jpeg', 'png', 'webp', 'gif', 'heic']
const OFFICE_EXT = ['docx', 'xlsx', 'pptx'] as const
const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'log', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'kt', 'swift', 'go', 'rs', 'c', 'h', 'cpp', 'cs', 'rb', 'php', 'sh', 'sql', 'html', 'css'] as const

const MIME_FAMILY: Array<[RegExp, AttachmentFamily]> = [
  [/^image\//, 'image'],
  [/^application\/pdf$/, 'pdf'],
  [/^application\/vnd\.openxmlformats-officedocument\./, 'office'],
  [/^(text\/|application\/(json|xml|x-yaml|yaml|x-ndjson))/, 'text'],
]
const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

export type Classification = { ok: true; family: AttachmentFamily; kind: SniffedKind } | { ok: false; reason: 'empty' | 'unsupported_type' | 'type_mismatch' }

/**
 * Accept only P0 types, decided from the bytes. A declared MIME/extension that names a DIFFERENT family than the bytes is refused (a renamed file cannot pass as another kind);
 * a missing or generic declaration (application/octet-stream) is judged by the bytes alone. Pure.
 */
export function classifyAttachment(f: { declaredMime?: string | null; filename?: string | null; bytes: Uint8Array }): Classification {
  if (f.bytes.length === 0) return { ok: false, reason: 'empty' }
  const kind = sniffKind(f.bytes)
  const ext = extOf(f.filename ?? '')
  let family: AttachmentFamily | null = null
  if (IMAGE_KINDS.includes(kind)) family = 'image'
  else if (kind === 'pdf') family = 'pdf'
  else if (kind === 'zip') family = (OFFICE_EXT as readonly string[]).includes(ext) ? 'office' : null
  else if (kind === 'text') family = (TEXT_EXT as readonly string[]).includes(ext) || !ext ? 'text' : null
  if (!family) return { ok: false, reason: 'unsupported_type' }
  const declared = (f.declaredMime ?? '').toLowerCase().split(';')[0].trim()
  if (declared && declared !== 'application/octet-stream') {
    const declaredFamily = MIME_FAMILY.find(([re]) => re.test(declared))?.[1]
    if (declaredFamily && declaredFamily !== family) return { ok: false, reason: 'type_mismatch' }
  }
  return { ok: true, family, kind }
}

// ── image preflight ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const IMAGE_PREFLIGHT_POLICY = { version: 'image-preflight.v1', maxSide: 12_000, maxPixels: 36_000_000, maxAspectRatio: 10 } as const

export type PreflightDecision = { decision: 'accept' } | { decision: 'reject'; reason: 'invalid_dimensions' | 'side_too_long' | 'too_many_pixels' | 'extreme_aspect_ratio' }

/** Decoded dimensions against the versioned policy, before a Vision call. A 1000x20000 image is small in bytes and still refused. Pure. */
export function imagePreflight(width: number, height: number, policy = IMAGE_PREFLIGHT_POLICY): PreflightDecision {
  if (![width, height].every(n => Number.isFinite(n) && Number.isInteger(n) && n > 0)) return { decision: 'reject', reason: 'invalid_dimensions' }
  if (Math.max(width, height) > policy.maxSide) return { decision: 'reject', reason: 'side_too_long' }
  if (width * height > policy.maxPixels) return { decision: 'reject', reason: 'too_many_pixels' }
  if (Math.max(width, height) / Math.min(width, height) > policy.maxAspectRatio) return { decision: 'reject', reason: 'extreme_aspect_ratio' }
  return { decision: 'accept' }
}

// ── attachment-only request ────────────────────────────────────────────────────────────────────────────────────────────

export interface ImplicitTask { task: 'DESCRIBE_OR_SUMMARIZE_ATTACHMENT'; stream: 'GENERAL_KNOWLEDGE'; /** this is metadata, never a hidden user message or a system instruction */ origin: 'server_generated'; allowSideEffects: false }

export type NormalizedRequest =
  | { ok: true; implicit: ImplicitTask | null }
  | { ok: false; error: 'empty_request' }

/**
 * Text (Unicode-trimmed) plus the count of attachments the SERVER has authorized. No text and no authorized attachment is a validation error; no text and at least one is a valid request
 * with the implicit task; any text means the person's own words rule. A client-claimed attachment that is not authorized counts as none. Pure.
 */
export function implicitAttachmentTask(text: string, authorizedAttachments: number): NormalizedRequest {
  const hasText = String(text ?? '').replace(/[\s\p{Cf}]/gu, '').length > 0
  if (hasText) return { ok: true, implicit: null }
  if (authorizedAttachments > 0) return { ok: true, implicit: { task: 'DESCRIBE_OR_SUMMARIZE_ATTACHMENT', stream: 'GENERAL_KNOWLEDGE', origin: 'server_generated', allowSideEffects: false } }
  return { ok: false, error: 'empty_request' }
}

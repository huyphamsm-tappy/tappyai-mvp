import { describe, it, expect } from 'vitest'
import { sniffKind, classifyAttachment, imagePreflight, implicitAttachmentTask, IMAGE_PREFLIGHT_POLICY } from './policy'

const bytes = (...n: number[]) => Uint8Array.from(n)
const text = (s: string) => new TextEncoder().encode(s)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const PDF = text('%PDF-1.7\n1 0 obj')
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0)
const WEBP = Uint8Array.from([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP')])
const HEIC = Uint8Array.from([0, 0, 0, 24, ...text('ftypheic'), 0, 0])

describe('sniffKind (by bytes, never by name)', () => {
  it('recognises the P0 signatures', () => {
    expect(sniffKind(JPEG)).toBe('jpeg'); expect(sniffKind(PNG)).toBe('png'); expect(sniffKind(PDF)).toBe('pdf'); expect(sniffKind(ZIP)).toBe('zip')
    expect(sniffKind(WEBP)).toBe('webp'); expect(sniffKind(HEIC)).toBe('heic'); expect(sniffKind(text('GIF89a....'))).toBe('gif')
  })
  it('plain UTF-8 is text (Vietnamese included); a NUL byte or invalid UTF-8 is not', () => {
    expect(sniffKind(text('Xin chào, đây là ghi chú'))).toBe('text')
    expect(sniffKind(bytes(0x41, 0x00, 0x42))).toBe('unknown')
    expect(sniffKind(bytes(0xc3, 0x28, 0x41))).toBe('unknown')
    expect(sniffKind(new Uint8Array())).toBe('unknown')
  })
})

describe('classifyAttachment', () => {
  it('accepts a real image, PDF, Office zip with an Office extension, and text', () => {
    expect(classifyAttachment({ declaredMime: 'image/jpeg', filename: 'a.jpg', bytes: JPEG })).toEqual({ ok: true, family: 'image', kind: 'jpeg' })
    expect(classifyAttachment({ declaredMime: 'application/pdf', filename: 'a.pdf', bytes: PDF })).toMatchObject({ ok: true, family: 'pdf' })
    expect(classifyAttachment({ filename: 'bao-cao.docx', bytes: ZIP })).toMatchObject({ ok: true, family: 'office' })
    expect(classifyAttachment({ declaredMime: 'text/csv', filename: 'a.csv', bytes: text('a,b\n1,2') })).toMatchObject({ ok: true, family: 'text' })
  })
  it('a renamed file cannot pass as another kind: the bytes win', () => {
    expect(classifyAttachment({ declaredMime: 'image/png', filename: 'a.png', bytes: PDF })).toEqual({ ok: false, reason: 'type_mismatch' })
    expect(classifyAttachment({ declaredMime: 'application/pdf', filename: 'a.pdf', bytes: JPEG })).toEqual({ ok: false, reason: 'type_mismatch' })
  })
  it('a generic or missing declaration is judged by the bytes alone', () => {
    expect(classifyAttachment({ declaredMime: 'application/octet-stream', filename: 'x', bytes: PNG })).toMatchObject({ ok: true, family: 'image' })
    expect(classifyAttachment({ bytes: PNG })).toMatchObject({ ok: true })
  })
  it('refuses what is not P0: an arbitrary zip, an unknown binary, an executable renamed .txt, an empty file', () => {
    expect(classifyAttachment({ filename: 'a.zip', bytes: ZIP })).toEqual({ ok: false, reason: 'unsupported_type' })
    expect(classifyAttachment({ filename: 'a.bin', bytes: bytes(1, 2, 0, 3) })).toEqual({ ok: false, reason: 'unsupported_type' })
    expect(classifyAttachment({ declaredMime: 'text/plain', filename: 'a.txt', bytes: bytes(0x4d, 0x5a, 0x90, 0x00, 0x03) })).toEqual({ ok: false, reason: 'unsupported_type' })
    expect(classifyAttachment({ filename: 'a.txt', bytes: new Uint8Array() })).toEqual({ ok: false, reason: 'empty' })
  })
  it('text with an unknown extension is refused, not guessed', () => {
    expect(classifyAttachment({ filename: 'a.exe', bytes: text('hello') })).toEqual({ ok: false, reason: 'unsupported_type' })
  })
})

describe('imagePreflight', () => {
  it('a normal photo is accepted', () => { expect(imagePreflight(4032, 3024)).toEqual({ decision: 'accept' }) })
  it('the 1000x20000 fixture (small in bytes, extreme in shape) is refused before Vision', () => {
    expect(imagePreflight(1000, 20000)).toEqual({ decision: 'reject', reason: 'side_too_long' })
    expect(imagePreflight(1000, 11000)).toEqual({ decision: 'reject', reason: 'extreme_aspect_ratio' })
  })
  it('too many pixels, bad numbers and a very wide strip are refused with their own reason', () => {
    expect(imagePreflight(8000, 8000)).toEqual({ decision: 'reject', reason: 'too_many_pixels' })
    expect(imagePreflight(0, 100)).toEqual({ decision: 'reject', reason: 'invalid_dimensions' })
    expect(imagePreflight(100.5, 100)).toEqual({ decision: 'reject', reason: 'invalid_dimensions' })
    expect(imagePreflight(NaN, 100)).toEqual({ decision: 'reject', reason: 'invalid_dimensions' })
    expect(imagePreflight(3000, 200)).toEqual({ decision: 'reject', reason: 'extreme_aspect_ratio' })
  })
  it('the limit is exact: at the maximum aspect ratio it passes', () => {
    expect(imagePreflight(2000, 200)).toEqual({ decision: 'accept' })
    expect(IMAGE_PREFLIGHT_POLICY.version).toBe('image-preflight.v1')
  })
})

describe('implicitAttachmentTask (attachment-only request)', () => {
  it('no text and an authorized attachment: the server-owned task, general stream, no side effects', () => {
    expect(implicitAttachmentTask('', 1)).toEqual({ ok: true, implicit: { task: 'DESCRIBE_OR_SUMMARIZE_ATTACHMENT', stream: 'GENERAL_KNOWLEDGE', origin: 'server_generated', allowSideEffects: false } })
    expect(implicitAttachmentTask('   \n\t', 2).ok).toBe(true)
  })
  it('zero-width and format characters are not text', () => {
    expect(implicitAttachmentTask(String.fromCharCode(0x200b, 0xfeff), 1)).toMatchObject({ ok: true, implicit: { task: 'DESCRIBE_OR_SUMMARIZE_ATTACHMENT' } })
  })
  it('real text means the person own words rule: no implicit task', () => {
    expect(implicitAttachmentTask('ảnh này là gì', 1)).toEqual({ ok: true, implicit: null })
  })
  it('no text and no authorized attachment is a validation error (a client-claimed attachment is not authorization)', () => {
    expect(implicitAttachmentTask('', 0)).toEqual({ ok: false, error: 'empty_request' })
    expect(implicitAttachmentTask(' ', 0)).toEqual({ ok: false, error: 'empty_request' })
  })
  it('the implicit task never enters Deep Research', () => {
    const r = implicitAttachmentTask('', 1)
    expect(r.ok && r.implicit?.stream).toBe('GENERAL_KNOWLEDGE')
  })
})

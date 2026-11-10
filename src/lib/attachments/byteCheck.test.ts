import { describe, it, expect, afterEach, vi } from 'vitest'
import { dataUrlMatchesDeclared } from './policy'
import { validateClientInput, attachmentByteCheckOn } from '@/lib/ai/security/clientInput'

// 1x1 transparent PNG and the opening of a PDF, as base64 (the real signatures, not placeholders)
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj').toString('base64')
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]).toString('base64')

const body = (contentType: string, b64: string, text = 'ảnh này là gì') => ({ messages: [{ role: 'user', content: text, experimental_attachments: [{ url: `data:${contentType};base64,${b64}`, contentType, name: 'a' }] }] })

describe('dataUrlMatchesDeclared', () => {
  it('true when the bytes are the declared type', () => {
    expect(dataUrlMatchesDeclared(`data:image/png;base64,${PNG_B64}`, 'image/png')).toBe(true)
    expect(dataUrlMatchesDeclared(`data:application/pdf;base64,${PDF_B64}`, 'application/pdf')).toBe(true)
    expect(dataUrlMatchesDeclared(`data:image/jpeg;base64,${JPEG_B64}`, 'image/jpeg')).toBe(true)
  })
  it('false for a PDF declared as an image, a JPEG declared as PNG, junk, a wrong prefix, and an unlisted type', () => {
    expect(dataUrlMatchesDeclared(`data:image/png;base64,${PDF_B64}`, 'image/png')).toBe(false)
    expect(dataUrlMatchesDeclared(`data:image/png;base64,${JPEG_B64}`, 'image/png')).toBe(false)
    expect(dataUrlMatchesDeclared('data:image/png;base64,AAAA', 'image/png')).toBe(false)
    expect(dataUrlMatchesDeclared(`data:image/jpeg;base64,${PNG_B64}`, 'image/png')).toBe(false)
    expect(dataUrlMatchesDeclared(`data:text/plain;base64,${PDF_B64}`, 'text/plain')).toBe(false)
  })
})

describe('validateClientInput with ATTACHMENT_BYTE_CHECK', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('off (default): a renamed file passes exactly as before', () => {
    expect(attachmentByteCheckOn({})).toBe(false)
    expect(validateClientInput(body('image/png', PDF_B64)).ok).toBe(true)
  })
  it('on: a real PNG passes and a PDF renamed as PNG is refused as invalid content', () => {
    vi.stubEnv('ATTACHMENT_BYTE_CHECK', '1')
    expect(validateClientInput(body('image/png', PNG_B64)).ok).toBe(true)
    const bad = validateClientInput(body('image/png', PDF_B64))
    expect(bad.ok).toBe(false); expect(!bad.ok && bad.code).toBe('invalid_content')
  })
  it('on: a real PDF passes; the flag is locked in a production runtime unless the owner lists it', () => {
    vi.stubEnv('ATTACHMENT_BYTE_CHECK', '1')
    expect(validateClientInput(body('application/pdf', PDF_B64)).ok).toBe(true)
    expect(attachmentByteCheckOn({ ATTACHMENT_BYTE_CHECK: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(attachmentByteCheckOn({ ATTACHMENT_BYTE_CHECK: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'ATTACHMENT_BYTE_CHECK' })).toBe(true)
  })
})

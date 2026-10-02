import { describe, it, expect } from 'vitest'
import encodeQR from 'qr'
import { classifyQrPayload } from './payload'
import { decodeQrFromPixels } from './clientDecode'

// Scam Shield · QR on the device (owner 02/10): what a code contains is decided from the decoded text alone, and the decoder runs on raw
// pixels — no server, no upload. A real QR is encoded here, rasterised to RGBA, and decoded back.

function rasterise(text: string, module = 8, quiet = 4) {
  const m = encodeQR(text, 'raw') as boolean[][]
  const n = m.length + quiet * 2
  const w = n * module
  const data = new Uint8Array(w * w * 4).fill(255)
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (!m[y][x]) continue
    for (let dy = 0; dy < module; dy++) for (let dx = 0; dx < module; dx++) {
      const i = (((y + quiet) * module + dy) * w + (x + quiet) * module + dx) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }
  return { width: w, height: w, data }
}

describe('decoding a QR from pixels, in memory', () => {
  it.each([
    'https://vietcombank.com.vn/dang-nhap',
    'http://vcb-secure-login.net/otp?x=1',
    'WIFI:T:WPA;S:Cafe;P:secret;;',
    '00020101021238570010A000000727012700069704220113031234567890208QRIBFTTA53037045802VN6304ABCD',
    'Chuyen khoan gap, nhap ma OTP vao day',
  ])('round-trips %s', async (text) => {
    expect(await decodeQrFromPixels(rasterise(text))).toBe(text)
  })
  it('a picture with no code in it decodes to null (no throw)', async () => {
    const blank = { width: 200, height: 200, data: new Uint8Array(200 * 200 * 4).fill(255) }
    expect(await decodeQrFromPixels(blank)).toBeNull()
  })
})

describe('what a decoded code is', () => {
  it('a web link goes to the link check (a bare domain gets https)', () => {
    expect(classifyQrPayload('https://example.com/a?b=1')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1' })
    expect(classifyQrPayload('vietcombank.com.vn/x')).toEqual({ kind: 'url', url: 'https://vietcombank.com.vn/x' })
    expect(classifyQrPayload('  HTTP://Evil.example/p  ').kind).toBe('url')
  })
  it('every other kind is named, never opened', () => {
    const cases: Array<[string, string]> = [
      ['000201010212382700069704', 'payment'], ['momo://pay?amount=100', 'payment'], ['WIFI:T:WPA;S:x;P:y;;', 'wifi'],
      ['BEGIN:VCARD\nFN:A', 'contact'], ['MECARD:N:A;;', 'contact'], ['tel:+84901234567', 'phone'], ['SMSTO:0901234567:hi', 'sms'],
      ['mailto:a@b.co', 'email'], ['geo:10.77,106.70', 'geo'], ['intent://x#Intent;scheme=http;end', 'app_link'], ['market://details?id=a', 'app_link'],
      ['hello world', 'text'], ['', 'text'],
    ]
    for (const [raw, kind] of cases) expect(classifyQrPayload(raw).kind, raw).toBe(kind)
  })
  it('javascript: and data: are app links, not web links (never checked as URLs, never opened)', () => {
    expect(classifyQrPayload('javascript:alert(1)').kind).toBe('app_link')
    expect(classifyQrPayload('data:text/html,<b>x</b>').kind).toBe('app_link')
    expect(classifyQrPayload('javascript:alert(1)').url).toBeUndefined()
  })
})

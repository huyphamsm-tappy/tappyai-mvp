import { describe, it, expect } from 'vitest'
import { isTextFile, decodeText, textFileBlock, readTextFile, TEXT_MAX_CHARS, TEXT_ACCEPT } from './textFile'

const bytes = (...n: number[]) => new Uint8Array(n)
const enc = (s: string) => new TextEncoder().encode(s)

describe('isTextFile (owner 20/11/2026: Tappy reads .md and Notepad files)', () => {
  it.each([
    ['ghi-chu.txt', 'text/plain'], ['README.md', 'text/markdown'], ['README.md', ''], ['notes.markdown', ''], ['data.csv', 'text/csv'], ['data.tsv', ''], ['cau-hinh.json', 'application/json'], ['nhat-ky.log', 'application/octet-stream'],
  ])('%s (%s) is a text file', (name, type) => { expect(isTextFile({ name, type })).toBe(true) })
  it.each([
    ['anh.png', 'image/png'], ['bao-cao.pdf', 'application/pdf'], ['a.docx', ''], ['b.xlsx', ''], ['trang.html', 'text/html'], ['script.js', 'text/javascript'], ['', ''], ['khong-duoi', ''],
  ])('%s (%s) is not', (name, type) => { expect(isTextFile({ name, type })).toBe(false) })
  it('the file picker offers them', () => { expect(TEXT_ACCEPT).toContain('.md'); expect(TEXT_ACCEPT).toContain('.txt'); expect(TEXT_ACCEPT).toContain('text/plain') })
})

describe('decodeText reads what Notepad writes', () => {
  it('UTF-8, with or without a byte-order mark', () => {
    expect(decodeText(enc('Xin chào Đà Lạt'))).toBe('Xin chào Đà Lạt')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Việt Nam')]))).toBe('Việt Nam')
  })
  it('UTF-16 little endian with a mark (Notepad "Unicode")', () => {
    const s = 'Tiếng Việt'
    const u16 = new Uint8Array(2 + s.length * 2); u16[0] = 0xff; u16[1] = 0xfe
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u16[2 + i * 2] = c & 0xff; u16[3 + i * 2] = c >> 8 }
    expect(decodeText(u16)).toBe('Tiếng Việt')
  })
  it('an old Vietnamese ANSI file (Windows-1258) is read, not turned into question marks', () => {
    // "Đà" in windows-1258: 0xD0 0x E0? ("Đ" = D0, "à" = E0)
    expect(decodeText(bytes(0xd0, 0xe0))).toBe('Đà')
  })
  it('an empty file is an empty string', () => { expect(decodeText(new Uint8Array())).toBe('') })
})

describe('textFileBlock', () => {
  it('puts the name and the text in a fenced block after the person\'s own words', () => {
    const b = textFileBlock('ghi-chu.md', '# Tiêu đề\nnội dung')
    expect(b).toContain('ghi-chu.md')
    expect(b).toContain('```')
    expect(b).toContain('# Tiêu đề\nnội dung')
  })
  it('a fence inside the file cannot close the block early', () => {
    const b = textFileBlock('a.md', 'trước\n```js\ncode\n```\nsau')
    const fences = b.match(/^`{3,}/gm) ?? []
    // the outer fence is longer than any run of backticks in the content
    expect(Math.max(...fences.map(f => f.length))).toBeGreaterThanOrEqual(4)
    expect(b).toContain('code')
  })
  it('a name with odd characters is shown on one line, cut short', () => {
    const b = textFileBlock('dong\nmot\n' + 'x'.repeat(300) + '.txt', 'a')
    expect(b.split('\n')[1]).not.toContain('mot\n')
    expect(b.length).toBeLessThan(400)
  })
})

describe('readTextFile', () => {
  const file = (content: string | Uint8Array, name = 'ghi-chu.txt') => new File([content as BlobPart], name, { type: 'text/plain' })
  it('returns the block for a normal file', async () => {
    const r = await readTextFile(file('Xin chào'))
    expect(r).toMatchObject({ ok: true, truncated: false })
    if (r.ok) expect(r.block).toContain('Xin chào')
  })
  it('cuts a very long file at the message limit and says so', async () => {
    const r = await readTextFile(file('a'.repeat(TEXT_MAX_CHARS + 5000)))
    expect(r).toMatchObject({ ok: true, truncated: true })
    if (r.ok) expect(r.block.length).toBeLessThan(TEXT_MAX_CHARS + 600)
  })
  it('refuses a binary file renamed .txt (NUL bytes) and an empty file', async () => {
    expect(await readTextFile(file(new Uint8Array([0x89, 0x50, 0x00, 0x00, 0x1a])))).toEqual({ ok: false, error: 'chatui.textUnreadable' })
    expect(await readTextFile(file(''))).toEqual({ ok: false, error: 'chatui.textUnreadable' })
  })
})

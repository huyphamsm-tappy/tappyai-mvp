// Plain text files in the chat (owner 20/11/2026: "Tappy cannot read a Markdown or a Notepad file"). A .txt / .md / .csv / .json / .log file chosen, dropped or pasted into the chat is READ IN THE BROWSER and its text is
// put into the message as a fenced block after the person's own words. Nothing new is uploaded or stored: it travels as ordinary message text, under the same 24.000-character message limit the server already has.
// Pure except readTextFile (File.arrayBuffer).

export const TEXT_MAX_CHARS = 20_000 // under the server's 24.000-character message limit, leaving room for what the person types
const TEXT_MAX_READ_BYTES = 400_000
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'log'])
const TEXT_MIME = new Set(['text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'text/tab-separated-values', 'application/json'])

/** The picker's accept additions. */
export const TEXT_ACCEPT = 'text/plain,text/markdown,text/csv,application/json,.txt,.md,.markdown,.csv,.tsv,.json,.log'

export function isTextFile(f: { name?: string; type?: string }): boolean {
  const ext = /\.([a-z0-9]+)$/i.exec(f.name ?? '')?.[1]?.toLowerCase() ?? ''
  const type = (f.type ?? '').toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  return TEXT_MIME.has(type)
}

/** What Notepad writes: UTF-8 (with or without a mark), UTF-16 with a mark, or an old ANSI file (Windows-1258 for Vietnamese). */
export function decodeText(b: Uint8Array): string {
  if (b.length === 0) return ''
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3))
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b) } catch { /* not UTF-8: an old ANSI file */ }
  try { return new TextDecoder('windows-1258').decode(b) } catch { return new TextDecoder('utf-8').decode(b) }
}

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

/** The block that goes into the message: a line with the name, then the text inside a fence longer than any run of backticks in it (so the text cannot close the fence early). */
export function textFileBlock(name: string, content: string, truncated = false): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(r => r.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `\n\n📎 ${oneLine(name) || 'file'}${truncated ? ' (truncated)' : ''}\n${fence}\n${content}\n${fence}\n`
}

export type TextRead = { ok: true; block: string; truncated: boolean } | { ok: false; error: 'chatui.textUnreadable' }

/** Reads a chosen text file. Never throws: an unreadable, empty or binary file is a refusal with the dictionary key of the sentence to show. */
export async function readTextFile(file: File): Promise<TextRead> {
  try {
    const raw = new Uint8Array(await file.slice(0, TEXT_MAX_READ_BYTES).arrayBuffer())
    if (raw.length === 0 || raw.includes(0) && !(raw[0] === 0xff && raw[1] === 0xfe) && !(raw[0] === 0xfe && raw[1] === 0xff)) return { ok: false, error: 'chatui.textUnreadable' }
    let text = decodeText(raw).replace(/\r\n?/g, '\n')
    if (!text.trim()) return { ok: false, error: 'chatui.textUnreadable' }
    const truncated = text.length > TEXT_MAX_CHARS || file.size > TEXT_MAX_READ_BYTES
    if (text.length > TEXT_MAX_CHARS) text = text.slice(0, TEXT_MAX_CHARS)
    return { ok: true, block: textFileBlock(file.name, text, truncated), truncated }
  } catch {
    return { ok: false, error: 'chatui.textUnreadable' }
  }
}

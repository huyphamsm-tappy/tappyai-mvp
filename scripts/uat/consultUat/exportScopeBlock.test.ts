// @vitest-environment node
// Wave 2B · exports, FROM THE SOURCE (not retyped), the scope block the model reads with CONSULT_GENERAL_ASSISTANT OFF and ON, for the Owner to read sentence by sentence.
//   write the file:  EXPORT_SCOPE_BLOCK_TO=D:/TappyAI-review-artifacts/consultative-wave2/scope-block-new.md node node_modules/vitest/vitest.mjs run --project app scripts/uat/consultUat/exportScopeBlock.test.ts
//   check the file:  the same command without the variable: the file on disk must equal what the code builds now (text and SHA-256 of both blocks), or the test fails.
// It builds the real prompt (`buildSystem`) with the flag unset and with it "1" and cuts out the block between its own headline and the next block's headline. No product code is changed.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildSystem } from '@/lib/ai/promptBuilder'

afterEach(() => { vi.unstubAllEnvs() })
const DEFAULT_OUT = 'D:/TappyAI-review-artifacts/consultative-wave2/scope-block-new.md'
const SOURCE = 'src/lib/ai/promptBuilder.ts'
const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex')

function scopeBlock(on: boolean): string {
  if (on) vi.stubEnv('CONSULT_GENERAL_ASSISTANT', '1'); else vi.unstubAllEnvs()
  const shared = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false).shared
  const a = shared.indexOf('===== PHAM VI HOAT DONG'), b = shared.indexOf('\n\n===== AN TOAN')
  if (a < 0 || b < a) throw new Error('scope block markers not found in the built prompt')
  return shared.slice(a, b)
}
/** 1-based line numbers, read from the source text itself. */
function sourceLines(): { legacy: [number, number]; general: [number, number]; pick: number; careful: number } {
  const src = readFileSync(SOURCE, 'utf8').split('\n')
  const find = (needle: string, from = 0) => { const i = src.findIndex((l, k) => k >= from && l.includes(needle)); if (i < 0) throw new Error('not found in source: ' + needle); return i }
  const l0 = find('const scopeBlockLegacy'), l1 = find('=====`', l0)
  const g0 = find('const scopeBlockGeneral'), g1 = find('=====`', g0)
  const careful = find('NHAY CAM', g0)
  return { legacy: [l0 + 1, l1 + 1], general: [g0 + 1, g1 + 1], pick: find('const scopeBlock = ') + 1, careful: careful + 1 }
}

/** Word-level difference of two lines: words only in the old line as [-word-], words only in the new line as {+word+} (a plain LCS; for reading only). */
function wordDiff(a: string, b: string): string {
  const x = a.split(' '), y = b.split(' ')
  const t: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const out: string[] = []
  let i = 0, j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push(x[i]); i++; j++ } else if (t[i + 1][j] >= t[i][j + 1]) out.push(`[-${x[i++]}-]`); else out.push(`{+${y[j++]}+}`)
  }
  while (i < x.length) out.push(`[-${x[i++]}-]`)
  while (j < y.length) out.push(`{+${y[j++]}+}`)
  return out.join(' ')
}

export function composeScopeMd(oldBlock: string, newBlock: string, lines: ReturnType<typeof sourceLines>): string {
  const oldL = oldBlock.split('\n'), newL = newBlock.split('\n')
  const pairs = ['MUA SAM bao gom ca viec', 'MUA SAM cung bao gom'].map(p => [oldL.find(l => l.startsWith(p)), newL.find(l => l.startsWith(p))] as const)
  const identical = newL.filter(l => oldL.includes(l) && l.trim() !== '' && !/^=+$/.test(l.trim()))
  const carefulLine = newL.find(l => l.includes('NHAY CAM'))!
  const sentences = carefulLine.split(/(?<=[.:;]) (?=[A-Z])/)
  return [
    '# Khối phạm vi (CONSULT_GENERAL_ASSISTANT) — nguyên văn từ mã, để Owner duyệt',
    '',
    `Tệp này được SINH TỰ ĐỘNG từ mã nguồn (không gõ lại bằng tay) bằng \`scripts/uat/consultUat/exportScopeBlock.test.ts\`: nó dựng prompt thật bằng \`buildSystem\` (src/lib/ai/promptBuilder.ts) với cờ chưa đặt (TẮT) và cờ \`1\` (BẬT), rồi cắt đúng đoạn từ tiêu đề "PHAM VI HOAT DONG" tới tiêu đề khối kế tiếp ("AN TOAN"). Chữ trong prompt cố ý viết KHÔNG DẤU (như toàn bộ prompt gốc).`,
    '',
    `- Nguồn: \`${SOURCE}\` — bản cũ (cờ TẮT) dòng ${lines.legacy[0]}–${lines.legacy[1]}; bản mới (cờ BẬT) dòng ${lines.general[0]}–${lines.general[1]}; dòng chọn bản theo cờ: ${lines.pick}; đoạn "trả lời thận trọng" ở dòng ${lines.careful}.`,
    '- Lệnh sinh tệp: `EXPORT_SCOPE_BLOCK_TO=D:/TappyAI-review-artifacts/consultative-wave2/scope-block-new.md node node_modules/vitest/vitest.mjs run --project app scripts/uat/consultUat/exportScopeBlock.test.ts` (chạy trong D:/TappyAI-wt/wt-integration).',
    '- Lệnh kiểm tệp == mã: cùng lệnh nhưng KHÔNG đặt biến `EXPORT_SCOPE_BLOCK_TO` — test so tệp với chuỗi mà mã dựng ngay lúc đó (chữ và SHA-256) và đỏ nếu lệch.',
    `- SHA-256 khối cũ (UTF-8): \`${sha(oldBlock)}\``,
    `- SHA-256 khối mới (UTF-8): \`${sha(newBlock)}\``,
    '- Mặc định production: cờ TẮT = bản cũ. Không có cờ nào được bật ở production bởi việc này.',
    '',
    '## 1. Bản CŨ — cờ TẮT (hành vi hiện tại)',
    '',
    '```text',
    oldBlock,
    '```',
    '',
    '## 2. Bản MỚI — cờ BẬT',
    '',
    '```text',
    newBlock,
    '```',
    '',
    '## 3. Đoạn "TRẢ LỜI THẬN TRỌNG" (y tế, pháp luật, tài chính, chính trị, tin tức) — đọc từng câu',
    '',
    `Đây là dòng ${lines.careful} của mã, nguyên văn (một dòng):`,
    '',
    '```text',
    carefulLine,
    '```',
    '',
    'Cùng đoạn đó, ngắt câu bằng máy để dễ đọc (chỉ để đọc; bản nguyên văn ở trên mới là nguồn):',
    '',
    ...sentences.map((s, i) => `${i + 1}. >>> ${s}`),
    '',
    '## 4. Hai đoạn MUA SẮM: KHÔNG giữ nguyên từng chữ — bản mới đã RÚT GỌN',
    '',
    `Dòng giống hệt nhau ở hai bản: ${identical.length === 0 ? 'KHÔNG có dòng nào' : identical.length + ' dòng'}. Hai đoạn mua sắm (quyết định mua; mua đồ cũ/giá trị cao) vẫn có ở bản mới nhưng đã bỏ bớt một số mệnh đề. So sánh theo từ (\`[-từ-]\` chỉ có ở bản CŨ, \`{+từ+}\` chỉ có ở bản MỚI; máy tạo, chỉ để đọc):`,
    '',
    ...pairs.flatMap(([o, n], i) => ['```text', `đoạn mua sắm ${i + 1}:`, o && n ? wordDiff(o, n) : '(không tìm thấy dòng ở một trong hai bản)', '```', '']),
  ].join('\n')
}

describe('scope block export', () => {
  it('builds both blocks from the real prompt, and they differ exactly as the flag says', () => {
    const o = scopeBlock(false), n = scopeBlock(true)
    expect(o).toContain('HAY TU CHOI LICH SU'); expect(n).not.toContain('HAY TU CHOI LICH SU')
    expect(n).toContain('NHAY CAM')
  })
  it('writes the file when EXPORT_SCOPE_BLOCK_TO is set; otherwise the file on disk equals what the code builds (text and SHA-256 of both blocks)', () => {
    const target = process.env.EXPORT_SCOPE_BLOCK_TO?.trim()
    const o = scopeBlock(false), n = scopeBlock(true)
    const md = composeScopeMd(o, n, sourceLines())
    if (target) { writeFileSync(target, md, 'utf8'); expect(readFileSync(target, 'utf8')).toBe(md); return }
    if (!existsSync(DEFAULT_OUT)) return
    const onDisk = readFileSync(DEFAULT_OUT, 'utf8')
    expect(onDisk).toBe(md)
    const fences = [...onDisk.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1])
    expect(fences[0]).toBe(o); expect(fences[1]).toBe(n)
    expect(onDisk).toContain(sha(o)); expect(onDisk).toContain(sha(n))
  })
})

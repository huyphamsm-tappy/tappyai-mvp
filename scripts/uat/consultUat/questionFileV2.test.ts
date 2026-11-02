// @vitest-environment node
// Wave 2B · the REAL files ext25-questions.txt (v1) and ext25-questions-v2.txt, and what the preflight says about each. MOCK-ONLY (no network, fake keys). Skipped when the files are absent.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { conditionReport } from './preflightReport'
import { gate1Summary } from './liveTrialLauncher.mjs'
import { isNearCopy, parseDevQuestions, sha256OfText } from './devQuestions'
import { UAT_TURNS } from './questions'

const DIR = 'D:/TappyAI-review-artifacts/consultative-round3n/'
const V1 = DIR + 'ext25-questions.txt', V2 = DIR + 'ext25-questions-v2.txt'
const HAVE = existsSync(V1) && existsSync(V2)
const V1_SHA = '65ebf4e35122b8dba1b4f2b288c2ac54427c796fd799e779a6a5b20de9cc2290'
const V2_SHA = '2f1d52d2ec773d8f83c86be02c7bfc04972708cef2ceea4dd6f68e46f5eaf80e'

const ENV: Record<string, string> = {
  BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: '0.05', BENCH_SPEND_RUN_CAP_USD: '1.75', BENCH_CONFIRM_SPEND: '1.75',
  CONSULT_REQUEST_CAP: '1', CONSULT_REQUEST_CAP_PER_TURN: '15', CONSULT_REQUEST_CAP_PER_RUN: '450', BENCH_RESET_FREE_QUOTA_PER_TURN: '1',
  BENCH_TRIAL_MODE: 'dev-multi', BENCH_TRIAL_QUESTION_FILE: V2, BENCH_TRIAL_OUT_DIR: 'D:/TappyAI-review-artifacts/consultative-wave2b/mock-out',
  CONSULTATIVE_V1: '1', BENCH_EXPECT_CONSULTATIVE_V1: '1', CONSULT_V2: '1', BENCH_EXPECT_CONSULT_V2: '1',
  OPENAI_API_KEY: 'sk-test-not-a-real-key', SERPER_API_KEY: 'serper-test-not-a-real-key',
}
afterEach(() => { vi.unstubAllEnvs() })
const rowsFor = (path: string) => {
  for (const [k, v] of Object.entries({ ...ENV, BENCH_TRIAL_QUESTION_FILE: path })) vi.stubEnv(k, v)
  return conditionReport({ env: { ...process.env }, repoRoot: 'D:/TappyAI-wt/wt-integration', questionText: readFileSync(path, 'utf8') })
}

describe('Gate 1 summary of a v2 file', () => {
  it('lists only the turns (directive lines are not turns), the SHA-256, the format and the withheld notes by id; the note text is not shown', () => {
    const text = ['@format|2', '@doc|documentation', 'Q1|Q1|1|một câu hỏi tự đặt', 'Q1|Q1|2|trả lời ngắn', '@note|Q1|2|(ghi chú KHÔNG hiện)', 'Q2|Q2|1|câu khác nữa'].join('\r\n')
    const lines = gate1Summary({ BENCH_TRIAL_MODE: 'dev-multi', BENCH_SPEND_RUN_CAP_USD: '1.75' }, text)
    const turns = lines.find(l => l.startsWith('lượt (id|hội thoại|lượt):'))!
    expect(turns).toBe('lượt (id|hội thoại|lượt): Q1|Q1|1  Q1|Q1|2  Q2|Q2|1')
    const info = lines.find(l => l.startsWith('tệp câu hỏi:'))!
    expect(info).toContain(`SHA-256 ${sha256OfText(text)}`)
    expect(info).toContain('định dạng v2')
    expect(info).toContain('ghi chú người chấm KHÔNG gửi cho mô hình: 1 (Q1#2)')
    expect(lines.join('\n')).not.toContain('ghi chú KHÔNG hiện')
  })
  it('a v1 text is shown as v1 with no notes', () => {
    const info = gate1Summary({ BENCH_TRIAL_MODE: 'dev-multi' }, 'Q1|Q1|1|một câu hỏi tự đặt').find(l => l.startsWith('tệp câu hỏi:'))!
    expect(info).toContain('định dạng v1'); expect(info).toContain(': 0')
  })
})

describe.skipIf(!HAVE)('the real question files', () => {
  it('v1 is untouched (SHA-256) and v2 has the recorded SHA-256', () => {
    expect(sha256OfText(readFileSync(V1, 'utf8'))).toBe(V1_SHA)
    expect(sha256OfText(readFileSync(V2, 'utf8'))).toBe(V2_SHA)
  })
  it('both pass the 70% rule in the preflight (30 turns, not a copy of the benchmark); v2 reports its identity and the two withheld notes by id', () => {
    for (const [path, sha] of [[V1, V1_SHA], [V2, V2_SHA]] as const) {
      const rows = rowsFor(path)
      const q = rows.find(r => r.name.startsWith('question file: parses'))!
      expect(q.ok, path).toBe(true); expect(q.detail).toBe('30 turns')
      const id = rows.find(r => r.name.startsWith('question file identity'))!
      expect(id.ok).toBe(true); expect(id.detail).toContain(`sha256=${sha}`)
      expect(id.detail).toContain(path === V2 ? 'format v2 | notes withheld: 2 (X1-2, X1-3)' : 'format v1 | notes withheld: 0')
      expect(id.detail).not.toContain('trả lời cho câu hỏi ngân sách')
    }
  })
  it('v2 gives the model the same 30 turns as v1 except the two lines whose bracket moved: those carry the user words only', () => {
    const a = parseDevQuestions(readFileSync(V1, 'utf8')), b = parseDevQuestions(readFileSync(V2, 'utf8'))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.turns).toHaveLength(30)
    expect(b.turns.map(t => [t.id, t.conversation, t.turn])).toEqual(a.turns.map(t => [t.id, t.conversation, t.turn]))
    const moved = new Set(['X1-2', 'X1-3'])
    for (let i = 0; i < 30; i++) if (!moved.has(a.turns[i].id)) expect(b.turns[i].text, a.turns[i].id).toBe(a.turns[i].text)
    expect(b.turns.find(t => t.id === 'X1-2')!.text).toBe('500.000–1 triệu')
    for (const t of b.turns) expect(t.text).not.toMatch(/\(trả lời|\(chỉ có nghĩa|ghi nhận nếu/)
    expect(b.notes.map(n => n.id)).toEqual(['X1-2', 'X1-3'])
    // no question of v2 (user words) and no question of v1 (whole text) is a near-copy of any benchmark question
    for (const t of [...a.turns, ...b.turns]) for (const bench of UAT_TURNS) expect(isNearCopy(t.text, bench.text), t.id).toBe(false)
  })
})

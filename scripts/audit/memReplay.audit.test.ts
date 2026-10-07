/**
 * MEMORY DRIFT REPLAY (audit tooling, not a product test).
 *
 * Reproduces what the audit user's `user_memory` row accumulates over the first N turns of the
 * CONSULTATIVE-40 set, turn by turn, exactly as `/api/chat` does it with CONSULTATIVE_V1 ON:
 * `extractMemoryFromConversation(thread, existing)` → `filterTransientMemory` → the route's merge
 * (`{...existing.preferences, ...extracted.preferences}` etc.) → `sanitizeMemoryPatch`. After each
 * turn it renders `buildMemoryBlock` so the drift in the PROMPT is visible, not just in the row.
 *
 * Runs ONLY with AUDIT_MEM_REPLAY=1 (real LLM calls against the audit env's key — N runs of the
 * job's budget). Skipped in the normal suite. Output:
 *   docs/audit/eval/memory/replay-<label>.json
 *
 *   AUDIT_MEM_REPLAY=1 AUDIT_MEM_TURNS=20 npx vitest run scripts/audit/memReplay.audit.test.ts
 */
import { describe, it } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const ENABLED = process.env.AUDIT_MEM_REPLAY === '1'
const AUDIT_ENV = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local'
const OUT_DIR = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/docs/audit/eval/memory'
const PROD_REF = 'fwznnobrdctuskgrvuik'

// Same order as scripts/audit/eval40.mjs (first pass of the 40). Follow-ups carry their parent.
const Q: Array<[string, string, string?]> = [
  ['F1', 'Tìm quán ăn tối ngon gần Quận 1 cho 2 người'],
  ['F2', 'tim quan bun bo ngon o q1 duoi 80k'],
  ['F3', 'Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?'],
  ['F4', 'Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận'],
  ['F5', 'quán này mở mấy giờ?', 'F4'],
  ['F6', 'quán số 2 có đông không?', 'F1'],
  ['F7', 'ăn gì ngon giờ'],
  ['F8', 'Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1'],
  ['S1', 'Mua tai nghe bluetooth dưới 1 triệu, pin trâu'],
  ['S2', 'mua laptop van phong duoi 15tr'],
  ['S3', 'cái rẻ nhất có tốt không?', 'S2'],
  ['S4', 'Robot hút bụi cho nhà có chó, tầm 5-7 triệu'],
  ['S5', 'quà sinh nhật cho bạn gái tầm 1tr'],
  ['S6', 'mua gì bây giờ'],
  ['S7', 'Máy lọc không khí cho phòng ngủ 20m2'],
  ['S8', 'Nồi chiên không dầu 5L loại nào tốt'],
  ['T1', 'Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'],
  ['T2', 'khach san da nang gan bien duoi 1tr/dem'],
  ['T3', 'Cái thứ hai có bao gồm ăn sáng không?', 'T2'],
  ['T4', 'Cuối tuần này gia đình 4 người đi đâu gần Sài Gòn?'],
  ['T5', 'đi chơi ở đâu'],
  ['T6', 'Hội An có gì hay, đi 1 ngày'],
  ['T7', 'Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất'],
  ['T8', 'Resort Phú Quốc cho kỷ niệm 1 năm, sang chút'],
  ['P1', 'Spa nào tốt rẻ ở Đà Nẵng'],
  ['P2', 'spa massage chan gan q1 duoi 300k'],
  ['P3', 'chỗ đó có đặt trước được không?', 'P2'],
  ['P4', 'Đi spa với mẹ cuối tuần, chỗ nào yên tĩnh sạch sẽ Quận 7'],
  ['P5', 'massage'],
  ['P6', 'Spa couple cho 2 người tối nay gần Quận 1'],
  ['P7', 'gội đầu dưỡng sinh gần đây'],
  ['P8', 'Spa nào mở khuya sau 22h ở Quận 3'],
  ['E1', 'Tối nay đi chơi gì với hội bạn 5 người ở Quận 1'],
  ['E2', 'rap phim nao gan q1'],
  ['E3', 'quán bar nào chill có nhạc sống Quận 1'],
  ['E4', 'chỗ đó có giữ xe không?', 'E3'],
  ['E5', 'cuối tuần làm gì'],
  ['E6', 'Karaoke cho 10 người tầm 100k/người Gò Vấp'],
  ['E7', 'Xem phim gì hay tối nay'],
  ['E8', 'Chỗ chơi cho trẻ em 5 tuổi cuối tuần ở Sài Gòn'],
]

function loadAuditEnv() {
  const env = Object.fromEntries(readFileSync(AUDIT_ENV, 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
  if (!env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF)) throw new Error('refusing: not the audit env')
  // Only the provider key is needed; nothing is printed.
  process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  process.env.LLM_PROVIDER = 'claude'
}

describe.skipIf(!ENABLED)('memory drift replay (audit env, real LLM)', () => {
  it('accumulates memory turn by turn and renders the block', async () => {
    loadAuditEnv()
    const { extractMemoryFromConversation, buildMemoryBlock } = await import('@/lib/memory/memoryService')
    const { filterTransientMemory } = await import('@/lib/ai/consultative/memoryTransientFilter')
    const { sanitizeMemoryPatch } = await import('@/lib/memory/memoryContract')
    const { shouldExtractMemory } = await import('@/lib/ai/memoryGate')
    const { classifyIntent, detectForcedTool } = await import('@/lib/ai/intent')
    type Mem = import('@/lib/memory/memoryService').UserMemory

    const n = Number(process.env.AUDIT_MEM_TURNS ?? Q.length)
    const label = process.env.AUDIT_MEM_LABEL ?? `first${n}`
    let existing: Mem | null = null
    const steps: unknown[] = []
    let runs = 0
    for (const [id, text, parent] of Q.slice(0, n)) {
      const thread: Array<{ role: string; content: string }> = []
      if (parent) {
        const p = Q.find(q => q[0] === parent)!
        thread.push({ role: 'user', content: p[1] }, { role: 'assistant', content: '(reply)' })
      }
      thread.push({ role: 'user', content: text }, { role: 'assistant', content: '(reply)' })
      const intent = classifyIntent(text) as 'chitchat' | 'tool'
      const gate = shouldExtractMemory({ text, intent, forcedTool: detectForcedTool(text) })
      if (!gate) { steps.push({ id, text, gate: false }); continue }
      runs++
      const raw = await extractMemoryFromConversation(thread, existing)
      const { memory: extracted, stats } = filterTransientMemory(raw, thread.filter(m => m.role === 'user').map(m => m.content))
      let merged: Mem | null = existing
      if (Object.keys(extracted).length > 0) {
        const patch = sanitizeMemoryPatch({
          location_base: extracted.location_base ?? existing?.location_base ?? null,
          discovery_city: extracted.discovery_city ?? existing?.discovery_city ?? null,
          companions: extracted.companions ?? existing?.companions ?? null,
          timing: extracted.timing ?? existing?.timing ?? null,
          personality: extracted.personality ?? existing?.personality ?? null,
          preferences: { ...(existing?.preferences || {}), ...(extracted.preferences || {}) },
          budget: { ...(existing?.budget || {}), ...(extracted.budget || {}) },
          history: extracted.history ?? existing?.history ?? [],
        })
        merged = { location_base: null, preferences: {}, budget: {}, history: [], ...(existing ?? {}), ...patch } as Mem
      }
      existing = merged
      const block = existing ? buildMemoryBlock(existing, null) : ''
      steps.push({ id, text, gate: true, raw, filterStats: stats, memory: existing, blockChars: block.length, block })
    }
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(`${OUT_DIR}/replay-${label}.json`, JSON.stringify({ label, turns: n, llmRuns: runs, steps }, null, 2))
  }, 600_000)
})

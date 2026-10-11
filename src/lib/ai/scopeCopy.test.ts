// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { cannedChitchat } from './cannedReply'
import { dictionaries } from '@/lib/i18n/dictionaries'
import { hubText } from '@/lib/i18n/discovery'
import { AGENT_SYSTEM } from './agent/prompt'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'

// Owner principle (11/10): Tappy answers EVERY kind of question like a general assistant and advises like a person. Food, shopping, travel,
// entertainment and spa are TOOLS with their own data — not the scope. Nothing a user or the model reads may present them as the scope.

const SCOPE_LISTS = [
  /tìm quán ăn,? spa/i, /ăn uống,? vui chơi,? phim,? mua sắm/i, /năm lĩnh vực/i, /5 lĩnh vực/i, /five domains/i,
  /looking for a place to eat, a spa/i, /trợ lý đời sống/i,
]

describe('no scope list in the copy a user or the model reads', () => {
  it('the canned greeting and chips (every locale) invite any topic and name no domain list as the offer', () => {
    for (const lang of ['vi', 'en']) {
      const g = cannedChitchat('xin chào', lang) ?? ''
      expect(g.length).toBeGreaterThan(40)
      for (const re of SCOPE_LISTS) expect(g).not.toMatch(re)
      expect(g).not.toMatch(/Gợi ý spa|Spa ideas|Food near me|Tìm quán ăn gần đây/)
      expect(g).toMatch(lang === 'vi' ? /bất cứ điều gì/ : /anything/i)
      expect(g).toMatch(lang === 'vi' ? /quyết định/ : /decision|decide/i)
    }
  })

  it('the UI welcome line, mood prompts and the chip bar are not venue-only (vi + en)', () => {
    for (const loc of ['vi', 'en'] as const) {
      const d = dictionaries[loc]
      expect(d['chat.welcomeSubtitle']).toMatch(loc === 'vi' ? /bất cứ điều gì/ : /anything/i)
      expect(d['search.placeholderExplore']).toMatch(loc === 'vi' ? /bất cứ điều gì/ : /anything/i)
      for (const k of ['chat.moodHappyPrompt', 'chat.moodStressPrompt', 'chat.moodTiredPrompt']) expect(d[k], `${loc} ${k}`).not.toMatch(/spa|cafe|quán|ăn uống|spots|spas/i)
      for (const k of ['chat.chipAdvice', 'chat.chipAdvicePrefill', 'chat.chipExplain', 'chat.chipExplainPrefill']) expect(d[k], `${loc} ${k}`).toBeTruthy()
      expect(hubText(loc, 'about.whatDomains')).not.toMatch(/năm lĩnh vực|five domains/i)
      expect(hubText(loc, 'about.whatDomains')).toMatch(loc === 'vi' ? /Hỏi gì cũng được/ : /Ask anything/)
      expect(hubText(loc, 'about.description')).toMatch(loc === 'vi' ? /bất cứ điều gì/ : /ask anything/i)
    }
  })

  it('the starter strip: at least half is any-topic, whatever the hour', () => {
    for (const h of [6, 12, 15, 18, 22]) {
      const out = getDynamicPrompts(h, 2, null, null, 3)
      expect(out.filter(p => p.category === 'general').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('the agent system prompt (flag OFF base) lists tools, not a scope', () => {
    for (const re of SCOPE_LISTS) expect(AGENT_SYSTEM).not.toMatch(re)
    expect(AGENT_SYSTEM).toMatch(/trả lời mọi loại câu hỏi/)
  })

  it('source scan: the files that hold prompts / canned copy name no domain list as the scope', () => {
    for (const f of ['src/lib/ai/agent/prompt.ts', 'src/lib/ai/agent/runtime/prompt.ts', 'src/lib/ai/cannedReply.ts', 'src/lib/ai/agent/runtime/consultativeVoice.ts', 'src/lib/ai/agent/index.ts']) {
      const src = readFileSync(f, 'utf8')
      for (const re of SCOPE_LISTS) {
        // consultativeVoice.ts legitimately NAMES the old line in its test-facing "gone" list? it does not; the pattern must be absent everywhere
        expect(src, `${f} ${re}`).not.toMatch(re)
      }
    }
  })
})

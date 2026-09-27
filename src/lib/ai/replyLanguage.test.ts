import { describe, it, expect } from 'vitest'
import { resolveReplyLanguage } from './replyLanguage'
import { detectLangConfident } from './intent'

// ADR-027 as amended 2026-09-28 (owner): the reply follows the CONVERSATION, not the UI.
describe('resolveReplyLanguage', () => {
  it('measured on the English-UI emulator: a short unaccented turn in a Vietnamese thread stays Vietnamese', () => {
    expect(detectLangConfident('len ke hoach 2 ngay 1 dem')).toBeNull() // the text alone settles nothing
    const r = resolveReplyLanguage({
      lastText: 'len ke hoach 2 ngay 1 dem',
      priorUserTexts: ['gia vang sjc hom nay bao nhieu', 'Cuối tuần đi Vũng Tàu 2 người ở khách sạn nào'],
      clientLocale: 'en',
    })
    expect(r).toEqual({ lang: 'vi', source: 'conversation' })
  })

  it('an English conversation stays English on a Vietnamese UI', () => {
    expect(resolveReplyLanguage({ lastText: 'ok thanks', priorUserTexts: ['What are the best cafes near District 1 for working?'], clientLocale: 'vi' }))
      .toEqual({ lang: 'en', source: 'conversation' })
  })

  it('the nearest earlier turn that settles a language wins; an earlier explicit request holds for the thread', () => {
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['What is good to eat here?', 'Tôi muốn ăn bún bò ở Quận 1'], clientLocale: 'en' }).lang).toBe('vi')
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['Trả lời bằng tiếng Anh nhé', 'quan 1'], clientLocale: 'vi' }).lang).toBe('en')
  })

  it('the message itself still decides first: an explicit request, then a clear language', () => {
    expect(resolveReplyLanguage({ lastText: 'answer in English please', priorUserTexts: ['Tôi muốn ăn bún bò'], clientLocale: 'vi' })).toEqual({ lang: 'en', source: 'explicit' })
    expect(resolveReplyLanguage({ lastText: 'Quán nào ngon nhất ở đây vậy?', priorUserTexts: ['Where should I eat tonight?'], clientLocale: 'en' })).toEqual({ lang: 'vi', source: 'message' })
  })

  it('the UI locale only breaks a tie nothing the user wrote settles (a first-turn "ok")', () => {
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: [], clientLocale: 'en' })).toEqual({ lang: 'en', source: 'client' })
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['ok', 'hmm'], clientLocale: 'vi' })).toEqual({ lang: 'vi', source: 'client' })
  })
})

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
    expect(r).toEqual({ lang: 'vi', source: 'conversation', named: null })
  })

  it('an English conversation stays English on a Vietnamese UI', () => {
    expect(resolveReplyLanguage({ lastText: 'ok thanks', priorUserTexts: ['What are the best cafes near District 1 for working?'], clientLocale: 'vi' }))
      .toEqual({ lang: 'en', source: 'conversation', named: null })
  })

  it('the nearest earlier turn that settles a language wins; an earlier explicit request holds for the thread', () => {
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['What is good to eat here?', 'Tôi muốn ăn bún bò ở Quận 1'], clientLocale: 'en' }).lang).toBe('vi')
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['Trả lời bằng tiếng Anh nhé', 'quan 1'], clientLocale: 'vi' }).lang).toBe('en')
  })

  it('the message itself still decides first: an explicit request, then a clear language', () => {
    expect(resolveReplyLanguage({ lastText: 'answer in English please', priorUserTexts: ['Tôi muốn ăn bún bò'], clientLocale: 'vi' })).toEqual({ lang: 'en', source: 'explicit', named: null })
    // 17/11: the message switches the conversation (English before it), so the turn names its language
    expect(resolveReplyLanguage({ lastText: 'Quán nào ngon nhất ở đây vậy?', priorUserTexts: ['Where should I eat tonight?'], clientLocale: 'en' })).toEqual({ lang: 'vi', source: 'message', named: 'vi' })
    // no switch: the same message in a Vietnamese thread names nothing
    expect(resolveReplyLanguage({ lastText: 'Quán nào ngon nhất ở đây vậy?', priorUserTexts: ['Tôi muốn ăn bún bò'], clientLocale: 'en' })).toEqual({ lang: 'vi', source: 'message', named: null })
  })

  it('18/11 (mutation gap): a language with a script of its own is named to the model even on a first message and in a thread already in it; a Latin-script language is not', () => {
    const ja = '東京でおすすめのラーメン屋を教えてください'
    expect(resolveReplyLanguage({ lastText: ja, priorUserTexts: [], clientLocale: 'vi' })).toMatchObject({ lang: 'ja', source: 'message', named: 'ja' })
    expect(resolveReplyLanguage({ lastText: ja, priorUserTexts: [ja], clientLocale: 'vi' })).toMatchObject({ lang: 'ja', named: 'ja' })
    expect(resolveReplyLanguage({ lastText: 'Quán nào ngon nhất ở đây vậy?', priorUserTexts: [], clientLocale: 'en' })).toMatchObject({ lang: 'vi', named: null })
  })

  it('the UI locale only breaks a tie nothing the user wrote settles (a first-turn "ok")', () => {
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: [], clientLocale: 'en' })).toEqual({ lang: 'en', source: 'client', named: null })
    expect(resolveReplyLanguage({ lastText: 'ok', priorUserTexts: ['ok', 'hmm'], clientLocale: 'vi' })).toEqual({ lang: 'vi', source: 'client', named: null })
  })
})

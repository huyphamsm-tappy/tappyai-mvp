import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest } from './intent'

describe('detectLang — regression: English text must not default to Vietnamese', () => {
  // Reported bug (2026-07-29): UI in English, quick prompts in English, user
  // asks in English, AI answers in Vietnamese. Root cause: any non-ASCII
  // codepoint that wasn't a recognized Asian script fell through to 'vi'.
  // Phone/desktop autocorrect inserts exactly this kind of punctuation into
  // ordinary English text.
  it('plain ASCII English → en', () => {
    expect(detectLang('Good bun bo spots in TP.HCM?')).toBe('en')
    expect(detectLang('Where can I find good coffee nearby?')).toBe('en')
  })

  it('curly quotes from autocorrect do not flip English to Vietnamese', () => {
    expect(detectLang('What’s a good restaurant near me?')).toBe('en') // curly apostrophe
    expect(detectLang('Find me a “cheap” hotel in Da Nang')).toBe('en') // curly quotes
  })

  it('em/en dash and ellipsis from autocorrect do not flip English to Vietnamese', () => {
    expect(detectLang('I want food — something spicy')).toBe('en') // em dash
    expect(detectLang('looking for a hotel… any suggestions?')).toBe('en') // ellipsis
  })

  it('incidental accented loanwords do not flip English to Vietnamese', () => {
    expect(detectLang('any good café nearby?')).toBe('en') // café
    expect(detectLang('a naïve question about visas')).toBe('en') // naïve
  })

  it('pure ASCII with no diacritics → en (unchanged behavior)', () => {
    expect(detectLang('hello world')).toBe('en')
  })
})

describe('detectLang — Vietnamese must still be recognized', () => {
  it('Vietnamese with full diacritics → vi', () => {
    expect(detectLang('Quán bún bò ngon ở TP.HCM?')).toBe('vi')
    expect(detectLang('Cho tôi gợi ý quán ăn ngon gần đây')).toBe('vi')
  })

  it('Vietnamese-distinctive letters alone are enough (đ, ă, ơ, ư)', () => {
    expect(detectLang('đâu')).toBe('vi')
    expect(detectLang('ăn gì')).toBe('vi')
    expect(detectLang('nhà ở đây')).toBe('vi')
  })
})

describe('detectLang — other scripts (unchanged from before the fix)', () => {
  it('Japanese (kana) → ja', () => {
    expect(detectLang('日本の旅行プランを教えて')).toBe('ja')
  })
  it('Korean (hangul) → ko', () => {
    expect(detectLang('서울 맛집 추천해줘')).toBe('ko')
  })
  it('Chinese (CJK unified) → zh', () => {
    expect(detectLang('推荐一些北京的餐厅')).toBe('zh')
  })
  it('Arabic → ar', () => {
    expect(detectLang('أين أجد مطعماً جيداً؟')).toBe('ar')
  })
  it('Thai → th', () => {
    expect(detectLang('ร้านอาหารอร่อยแถวนี้')).toBe('th')
  })
})

describe('detectExplicitLangRequest — explicit instruction overrides detection', () => {
  it('recognizes "Answer in English"', () => {
    expect(detectExplicitLangRequest('Answer in English')).toBe('en')
  })
  it('recognizes "Please respond in Japanese" (message itself is English)', () => {
    expect(detectExplicitLangRequest('Please respond in Japanese from now on')).toBe('ja')
  })
  it('recognizes "Trả lời bằng tiếng Việt"', () => {
    expect(detectExplicitLangRequest('Trả lời bằng tiếng Việt')).toBe('vi')
  })
  it('returns null for ordinary messages with no language instruction', () => {
    expect(detectExplicitLangRequest('Good bún bò spots in TP.HCM?')).toBeNull()
    expect(detectExplicitLangRequest('Quán bún bò ngon ở TP.HCM?')).toBeNull()
  })
})

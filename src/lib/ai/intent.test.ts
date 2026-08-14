import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest, classifyIntent } from './intent'

// classifyIntent picks between the full tool-capable prompt and the lightweight
// no-tool prompt. Getting it wrong is not a cost problem, it is a correctness
// one: the chitchat path runs with maxSteps:1, so if the model decides it needs
// a tool there is no second step in which to answer and the user receives an
// EMPTY reply. Measured 2026-08-10 against the running server, before the fix:
//
//   "hiện tại giá vàng bao nhiêu"  -> chitchat -> called get_gold_price -> 0 chars
//   "ok show me cafes in Hanoi"    -> chitchat -> called search_places  -> 0 chars
//
// Both were caused by the pattern being an unanchored PREFIX match: "hiện"
// starts with "hi", "uống" starts with "u", "ok show me…" starts with "ok".
describe('classifyIntent', () => {
  describe('genuine chitchat — nothing a tool could help with', () => {
    for (const t of [
      'Chào', 'Chào Tappy', 'chào bạn', 'xin chào', 'hi', 'hi there', 'hello', 'alo',
      'cảm ơn', 'cảm ơn nhé', 'cảm ơn bạn nhiều', 'thanks', 'thank you', 'Thanks so much',
      'ok', 'oke', 'okie', 'ừ', 'um', 'tạm biệt', 'bye', 'haha', 'hehe',
      'bạn là ai', 'bạn tên gì', 'TappyAI là gì', 'test', 'ok!', 'hello?', 'Chào Tappy!!',
    ]) {
      it(`"${t}"`, () => expect(classifyIntent(t)).toBe('chitchat'))
    }
  })

  describe('NOT chitchat — a greeting token merely starts the message', () => {
    for (const t of [
      // The two that shipped empty replies.
      'hiện tại giá vàng bao nhiêu',
      'ok show me cafes in Hanoi',
      // Same shape, other collisions.
      'uống gì ngon ở quận 1',
      'hôm nay ăn gì',
      'hiểu rồi, tìm quán khác đi',
      'ok cho mình xem quán ăn quận 1',
      'oke vậy đặt bàn ở đâu',
      'hi-end restaurants in Hanoi',
      'test tốc độ mạng ở Hà Nội',
      'umbrella shops near me',
      'bye bye Đà Nẵng, gợi ý quán ăn Hà Nội',
      'cảm ơn, giờ tìm khách sạn giúp mình',
      'thanks, now find me a hotel in Da Nang',
    ]) {
      it(`"${t}"`, () => expect(classifyIntent(t)).toBe('tool'))
    }
  })

  describe('NOT chitchat — ordinary requests, VI and EN', () => {
    for (const t of [
      'Gợi ý quán ăn ngon ở Quận 1', 'tỷ giá USD', 'thời tiết Hà Nội',
      'Suggest a good restaurant in District 1', 'gold price today',
      'quán nào gần trung tâm nhất?', 'which one is closest to the centre?',
    ]) {
      it(`"${t}"`, () => expect(classifyIntent(t)).toBe('tool'))
    }
  })

  it('an empty message is not chitchat', () => {
    expect(classifyIntent('')).toBe('tool')
    expect(classifyIntent('   ')).toBe('tool')
  })
})

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

describe('detectLang — regression: an English sentence naming one Vietnamese place/dish must not flip to Vietnamese', () => {
  // Production incident (2026-07-30): "Phú Quốc itinerary, 4 days, 2 people,
  // 8M budget" and "i wanna go to eat Phở" both answered in Vietnamese. Root
  // cause: detectLang flagged Vietnamese on the mere PRESENCE of an accented
  // Vietnamese word anywhere in the message, so correctly spelling a
  // destination or dish name (as any real user does) was enough on its own —
  // even though every other word in the sentence was English. Fixed by
  // judging the PROPORTION of accented words, not a single occurrence.
  it('one Vietnamese place name in an English sentence → en', () => {
    expect(detectLang('Phú Quốc itinerary, 4 days, 2 people, 8M budget')).toBe('en')
    expect(detectLang('Plan a 3-day trip to Đà Nẵng')).toBe('en')
    expect(detectLang('i wanna go to eat Phở')).toBe('en')
  })

  // The place name dominates the word count — the case a plain accented-word
  // ratio still got wrong.
  it('short English query dominated by a Vietnamese place name → en', () => {
    expect(detectLang('Đà Nẵng hotels')).toBe('en')
    expect(detectLang('Phú Quốc resorts')).toBe('en')
    expect(detectLang('Hội An walking tour')).toBe('en')
  })

  it('lowercase Vietnamese dish name in an English sentence → en', () => {
    expect(detectLang('Best bún chả in Hà Nội?')).toBe('en')
    expect(detectLang('Where can I try bánh mì near me?')).toBe('en')
  })

  it('Vietnamese place names that collide with Vietnamese function words → en', () => {
    // "Hà Nội" strips to "ha noi", "Hồ Chí Minh" to "ho chi minh", "Cần Thơ" to
    // "can tho" — none may count as a Vietnamese grammar-word signal.
    expect(detectLang('Top restaurants in Hồ Chí Minh City')).toBe('en')
    expect(detectLang('Weekend trip to Cần Thơ from Sài Gòn')).toBe('en')
    expect(detectLang('Is Hòn Thơm island worth visiting?')).toBe('en')
  })
})

describe('detectLang — Vietnamese with sparse tone marks (function-word signal)', () => {
  it('short Vietnamese sentence with few accented words → vi', () => {
    expect(detectLang('Cho tôi xem menu')).toBe('vi')
    expect(detectLang('cho minh xem quán nào ngon')).toBe('vi')
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

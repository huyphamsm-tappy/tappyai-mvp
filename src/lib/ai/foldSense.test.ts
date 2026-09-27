import { describe, it, expect } from 'vitest'
import { foldForLexicon } from './foldSense'
import { turnDomain, turnStartsNewConsultation } from './consultative/actionability'
import { deriveShoppingConstraints } from './consultative/shoppingConstraints'

// UAT3 item 5 (2026-09-27): the audit of every domain/product lexicon for words that collide once
// diacritics are folded. Each sentence below was measured misclassified before the fix
// (mưa→shopping, phố→food, An→food, lâu→food, tốc→spa, tự động→fridge, mấy anh→camera …).

const OPTS = { hasGps: false, lang: 'vi' }
const domain = (s: string) => turnDomain({ role: 'user', content: s }, OPTS)
const product = (s: string) => deriveShoppingConstraints([{ role: 'user', content: s }], null).productType

describe('foldForLexicon', () => {
  it('keeps the lexicon word, tags the other accented readings', () => {
    expect(foldForLexicon('mua laptop')).toBe('mua laptop')
    expect(foldForLexicon('trời mưa')).toBe('troi mua_')
    expect(foldForLexicon('ăn phở ở phố cổ')).toBe('an pho o pho_ co')
    expect(foldForLexicon('Hội An')).toBe('hoi an_')
  })
  it('text typed without diacritics folds exactly as before', () => {
    expect(foldForLexicon('troi mua di dau choi')).toBe('troi mua di dau choi')
  })
})

describe('no domain from a colliding word — typed with diacritics', () => {
  it.each([
    'hội an có gì hay', 'khu này có an toàn không', 'an ninh ở đó sao',
    'thành phố hồ chí minh có gì chơi', 'phố đi bộ nguyễn huệ tối nay', 'phố cổ hà nội',
    'bao lâu thì tới', 'lâu đài tình ái đà lạt', 'môn thể thao nào dễ chơi', 'tắm bùn nha trang',
    'trời mưa đi đâu chơi', 'mùa này đi đà lạt đẹp không', 'xem múa lân ở đâu', 'mùa hè đi biển nào',
    'tốc độ wifi ở đó', 'dân tộc thiểu số sapa', 'gia hạn tự động bị trừ tiền',
    'mấy anh ơi cho hỏi quán nào ngon', 'xe đầy khách không lên được',
  ])('%s', (s) => {
    expect(domain(s)).toBeNull()
    expect(product(s)).toBeNull()
  })
})

describe('no domain from a colliding word — typed without diacritics (context guards)', () => {
  it.each([
    'hoi an co gi hay', 'khu nay co an toan khong', 'thanh pho ho chi minh co gi choi', 'pho di bo nguyen hue toi nay',
    'pho co ha noi', 'bao lau thi toi', 'troi mua di dau choi', 'mua he di bien nao', 'toc do wifi o do',
    'dan toc thieu so sapa', 'gia han tu dong bi tru tien', 'may anh oi cho hoi quan nao ngon',
  ])('%s', (s) => {
    expect(domain(s)).toBeNull()
    expect(product(s)).toBeNull()
  })
})

describe('the real cues still work, with and without diacritics', () => {
  it.each([
    ['ăn phở ở đâu ngon quận 3', 'food'], ['quan pho ngon quan 3', 'food'], ['an gi o quan 1', 'food'], ['lẩu thái ngon ở đâu', 'food'],
    ['lau thai ngon o dau', 'food'], ['ăn sáng ở đâu ngon', 'food'], ['mua laptop dưới 20 triệu', 'shopping'], ['mua laptop duoi 20 trieu', 'shopping'],
    ['cắt tóc nam ở quận 1', 'spa'], ['cat toc nam o quan 1', 'spa'], ['đi nhảy múa tối nay', 'entertainment'],
  ])('%s → %s', (s, want) => {
    expect(domain(s)).toBe(want)
  })
  it.each([
    ['mua máy ảnh canon', 'camera'], ['mua may anh canon', 'camera'], ['tủ đông sanyo 200 lít', 'fridge'], ['tu dong sanyo 200 lit', 'fridge'],
    ['máy giặt tự động', 'washer'], ['xe đẩy cho bé gấp gọn', 'baby'], ['ví da nam', 'bag'], ['váy cưới', 'clothing'],
  ])('%s → %s', (s, want) => {
    expect(product(s)).toBe(want)
  })
})

// The three verticals the owner named, each switching subject inside one thread.
const thread = (...turns: string[]) => turns.flatMap((t, i) => (i < turns.length - 1 ? [{ role: 'user', content: t }, { role: 'assistant', content: 'ok' }] : [{ role: 'user', content: t }]))

describe('subject switches across food, spa and entertainment', () => {
  it('food → spa → entertainment: each turn starts a new subject', () => {
    expect(turnStartsNewConsultation({ messages: thread('trưa nay ăn gì dưới 100k quận 3', 'chiều đi gội đầu massage ở đâu gần đó'), ...OPTS })).toBe(true)
    expect(turnStartsNewConsultation({ messages: thread('trưa nay ăn gì dưới 100k quận 3', 'chiều đi gội đầu massage ở đâu gần đó', 'tối nay xem phim rạp nào'), ...OPTS })).toBe(true)
  })
  it('rain is not a purchase: an outing after a meal is a switch to entertainment, not shopping', () => {
    const msgs = thread('ăn lẩu ở đâu quận 1', 'trời mưa tối nay đi đâu chơi')
    expect(domain('trời mưa tối nay đi đâu chơi')).not.toBe('shopping')
    expect(turnStartsNewConsultation({ messages: msgs, ...OPTS })).toBe(domain('trời mưa tối nay đi đâu chơi') !== null)
  })
  it('"bao lâu" after a hot-pot answer is a follow-up, not a new food subject', () => {
    expect(turnStartsNewConsultation({ messages: thread('ăn lẩu ở đâu quận 1', 'bao lâu thì tới đó'), ...OPTS })).toBe(false)
  })
  it('spa → shopping → spa', () => {
    expect(turnStartsNewConsultation({ messages: thread('spa massage chân ở phú nhuận dưới 300k', 'tiện mua máy sấy tóc philips dưới 1 triệu'), ...OPTS })).toBe(true)
    expect(turnStartsNewConsultation({ messages: thread('spa massage chân ở phú nhuận dưới 300k', 'tiện mua máy sấy tóc philips dưới 1 triệu', 'gội đầu dưỡng sinh nào mở khuya'), ...OPTS })).toBe(true)
  })
})

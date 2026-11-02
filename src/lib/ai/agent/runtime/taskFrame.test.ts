import { describe, it, expect } from 'vitest'
import { parseTaskFrame, stripTaskFrame, taskToolGate, cardsAllowed, missingDeliverables, deliverablesRetryNote, TASK_KINDS, dedupeAroundTaskFrame, dropMetaNotes, scrubDegenerate } from './taskFrame'

// CONSULT_V3 task frame (owner 17/10): the model declares the turn's task; code gates tools / cards and checks deliverables. Pure units.

const F = (kind: string, extra: object = {}) => `[TAPPY_TASK]${JSON.stringify({ kind, constraints: [], servings: null, ...extra })}[/TAPPY_TASK]`

describe('parseTaskFrame / stripTaskFrame', () => {
  it('reads kind, constraints and servings, and removes the line', () => {
    const r = parseTaskFrame(`Ok pa.\n${F('recipe', { constraints: ['nấu ở nhà', '5–6 người', 'trời mưa'], servings: 6 })}`)
    expect(r.text).toBe('Ok pa.')
    expect(r.frame).toEqual({ kind: 'recipe', constraints: ['nấu ở nhà', '5–6 người', 'trời mưa'], servings: 6 })
  })
  it('the last valid block wins; an unknown kind or malformed JSON is removed but not used; an unclosed block is cut to the end', () => {
    expect(parseTaskFrame(`${F('place_find')} a ${F('recipe')}`).frame?.kind).toBe('recipe')
    expect(parseTaskFrame(`x ${F('hack_the_system')}`)).toEqual({ text: 'x', frame: null })
    expect(parseTaskFrame('x [TAPPY_TASK]{nope[/TAPPY_TASK] y')).toEqual({ text: 'x  y', frame: null })
    expect(parseTaskFrame('Trả lời. [TAPPY_TASK]{"kind":"rec').text).toBe('Trả lời.')
  })
  it('constraints are cleaned (no markers, no control chars, ≤ 6 × 60 chars); servings out of range is null', () => {
    const r = parseTaskFrame(F('recipe', { constraints: ['[TAPPY_PLACES]x', 'a'.repeat(100), '<b>', '1', '2', '3', '4', '5'], servings: 999 }))
    expect(r.frame?.constraints[0]).toBe('x')
    expect(r.frame?.constraints[1].length).toBe(60)
    expect(r.frame?.constraints.length).toBe(6)
    expect(r.frame?.servings).toBeNull()
  })
  it('text without a frame is returned unchanged (byte for byte)', () => {
    const t = 'Không có gì.\n\n\n\nGiữ nguyên  khoảng trắng.'
    expect(stripTaskFrame(t)).toBe(t)
  })
})

describe('dedupeAroundTaskFrame / dropMetaNotes (eval 17/10)', () => {
  const LONG = 'Trời mưa thì ăn lẩu bò nóng hổi, bún bò Huế cay cay hoặc cháo sườn nhẹ bụng đều hợp, cá nhân tui chọn bún bò vì nóng và cay, ăn nghe mưa rơi là đúng bài luôn đó pa ơi.'
  const SHORT = 'Tóm lại bún bò Huế là chân ái, muốn no lâu thì lẩu bò, muốn nhẹ bụng thì cháo sườn, vậy thôi pa, chúc pa ăn ngon miệng nha, trời mưa nhớ mặc ấm nha pa.'
  it('two substantial parts around the line: the longer part is kept; one short part (a normal preface) is left alone', () => {
    expect(dedupeAroundTaskFrame(`${LONG}\n${F('chat')}\n${SHORT}`)).toBe(`${LONG}\n`)
    expect(dedupeAroundTaskFrame(`${F('chat')}\n${LONG}`)).toBeNull()
    expect(dedupeAroundTaskFrame(`Ok pa. ${F('chat')} ${LONG}`)).toBeNull()
  })
  it('an English planning note is removed from a Vietnamese reply; a legitimate English quotation and a product name stay', () => {
    const r = dropMetaNotes('Món này ngon lắm. (Oops don\'t use weird code; need final exactly task line at end.) Ăn liền nha.\nNeed remove question because not necessary and the answer should be final.', 'vi')
    expect(r.removed).toBe(2)
    expect(r.text).toBe('Món này ngon lắm.  Ăn liền nha.')
    const keep = 'Câu nổi tiếng của Steve Jobs: "Stay hungry, stay foolish, it is the best advice I can give you." Còn iPhone 16 Pro Max thì đắt.'
    expect(dropMetaNotes(keep, 'vi')).toEqual({ text: keep, removed: 0 })
    expect(dropMetaNotes('Need final answer now, the user question is already ok.', 'en').removed).toBe(0)
  })
})

describe('scrubDegenerate (eval 17/10)', () => {
  it('end tokens, raw tool-call lines and foreign-script letters are removed', () => {
    const r = scrubDegenerate(`Bầu trời xanh vì tán xạ.\n${'[END]\n'.repeat(50)}`, 'vi')
    expect(r.text).toBe('Bầu trời xanh vì tán xạ.')
    expect(r.fixes).toContain('end_tokens')
    expect(scrubDegenerate('{"name":"get_trip_data","arguments":{"q":"Phú Quốc"}} ആണ്\nLịch Phú Quốc 4 ngày nè.', 'vi').text).toBe('Lịch Phú Quốc 4 ngày nè.')
  })
  it('a tool call written as text (search_places(...) or an invoke tag) never reaches the answer (eval 17/10 nw-3)', () => {
    const nw3 = '[functions.use_tool(tool="get_news",args={"query":"giá xăng tuần này"} why="Tra kỳ điều hành"}]\n\nChưa tra được kỳ điều hành giá xăng tuần này.'
    const r = scrubDegenerate(nw3, 'vi')
    expect(r.text).toBe('Chưa tra được kỳ điều hành giá xăng tuần này.')
    expect(r.fixes).toContain('tool_call_json')
    expect(scrubDegenerate('search_places(query="quán phở Hà Nội")\nQuán phở Thìn ở Bát Đàn.', 'vi').text).toBe('Quán phở Thìn ở Bát Đàn.')
    expect(scrubDegenerate('<invoke name="get_news">\nTin mới hôm nay.', 'vi').text).toBe('Tin mới hôm nay.')
    // A/B smoke 17/10 (nw-3 again): the model wrote a placeholder line of its own
    expect(scrubDegenerate('[tool call omitted]\n\nMình chưa tra được kỳ điều chỉnh giá xăng tuần này.', 'vi').text).toBe('Mình chưa tra được kỳ điều chỉnh giá xăng tuần này.')
    expect(scrubDegenerate('[[tool call?]]\n\nMình làm lịch Phú Quốc theo nhịp gia đình.', 'vi').text).toBe('Mình làm lịch Phú Quốc theo nhịp gia đình.')
    // rerun 3 (sw-10): a line opened by a tool tag, with its error note
    expect(scrubDegenerate('4. Chọn loại đáng tiền nhất\n[TOOL_CALL]{"tool":"search_products","args":{"query":"nồi cơm điện"}}[/TOOL_CALL] [TOOL_ERROR] tool use unavailable in this environment\n\nGiá thay đổi theo cửa hàng.', 'vi').text).toBe('4. Chọn loại đáng tiền nhất\n\nGiá thay đổi theo cửa hàng.')
    // a bracket in a sentence is the answer's own text
    expect(scrubDegenerate('Nút [tool call] trong app giúp bạn gọi tổng đài.', 'vi').text).toBe('Nút [tool call] trong app giúp bạn gọi tổng đài.')
  })
  it('a role token with extra fields and Cyrillic letters are removed (A/B eval 17/10 tp-1, tp-2); an English answer keeps its text', () => {
    expect(scrubDegenerate('<|im_start|assistant|final> (ignore)\nLịch Đà Lạt 3 ngày.', 'vi').text).toBe('Lịch Đà Lạt 3 ngày.')
    expect(scrubDegenerate('Ngày 2 đi Grand World қәр rồi về.', 'vi').text).toBe('Ngày 2 đi Grand World rồi về.')
  })
  // UAT round 19/10 (u03): a weather question asked in Thai lost every Thai word — only "21°C 19°C ; 13–27°C 0% (17:07 .)" reached the user.
  it('a script the user writes in is kept; the same letters stay stray in a Vietnamese conversation', () => {
    const thai = 'เมลเบิร์นตอนนี้ **21°C** ท้องฟ้าแจ่มใส; วันนี้ **13–27°C** โอกาสฝน 0%'
    expect(scrubDegenerate(thai, 'vi', { userText: 'วันนี้อากาศที่เมลเบิร์นเป็นยังไง?' }).text).toBe(thai)
    // unchanged since 17/10: the stray run is removed where it stands (the space on each side stays)
    expect(scrubDegenerate('Hôm nay trời đẹp ทดสอบ lắm.', 'vi', { userText: 'Thời tiết hôm nay?' }).text).toBe('Hôm nay trời đẹp  lắm.')
    expect(scrubDegenerate('Сегодня солнечно, 21°C.', 'vi', { userText: 'Какая погода в Москве?' }).text).toBe('Сегодня солнечно, 21°C.')
    expect(scrubDegenerate('Ngày 2 đi Grand World қәр rồi về.', 'vi', { userText: 'Lịch Phú Quốc 4 ngày' }).text).toBe('Ngày 2 đi Grand World rồi về.')
    // only the script the user used is kept: a Thai user's answer still loses stray Cyrillic
    expect(scrubDegenerate('อากาศดี қәр วันนี้', 'vi', { userText: 'อากาศเป็นยังไง' }).text).toBe('อากาศดี วันนี้')
  })
  it('a function call inside a ``` code block stays (a coding answer)', () => {
    const code = 'Ví dụ:\n```python\nget_weather(city="Huế")\n```\nXong.'
    expect(scrubDegenerate(code, 'vi').text).toBe(code)
  })
  it('a second copy of the whole answer is dropped (the longer copy kept); a Chinese term stays', () => {
    const A = 'AI là khái niệm rộng về việc khiến máy làm những việc cần trí thông minh của con người, còn machine learning là một nhánh của AI học từ dữ liệu để dự đoán.'
    const r = scrubDegenerate(`${A} Thêm ý một. Thêm ý hai.\n\n${A}`, 'vi')
    expect(r.text).toBe(`${A} Thêm ý một. Thêm ý hai.`)
    expect(r.fixes).toContain('second_copy')
    expect(scrubDegenerate('Chơi chữ “碗上筷火” đọc thành “晚上快活”.', 'vi').text).toBe('Chơi chữ “碗上筷火” đọc thành “晚上快活”.')
  })
})

describe('tool and card gates', () => {
  it('place tools only for place / trip / compare tasks; product search only for shopping / compare', () => {
    for (const k of ['recipe', 'how_to', 'knowledge', 'explain', 'chat', 'advice', 'news', 'live_info', 'shopping'] as const) expect(taskToolGate(k, 'search_places', 'vi')).not.toBeNull()
    for (const k of ['place_find', 'place_followup', 'trip_plan', 'compare'] as const) expect(taskToolGate(k, 'search_places', 'vi')).toBeNull()
    expect(taskToolGate('recipe', 'search_products', 'vi')).not.toBeNull()
    expect(taskToolGate('shopping', 'search_products', 'vi')).toBeNull()
    for (const k of TASK_KINDS) { expect(taskToolGate(k, 'web_search', 'vi')).toBeNull(); expect(taskToolGate(k, 'get_news', 'vi')).toBeNull() }
  })
  it('cards follow the same split', () => {
    expect(cardsAllowed('recipe')).toEqual({ places: false, shopping: false })
    expect(cardsAllowed('place_find')).toEqual({ places: true, shopping: false })
    expect(cardsAllowed('compare')).toEqual({ places: true, shopping: true })
  })
})

describe('missingDeliverables', () => {
  const recipe = { kind: 'recipe' as const, constraints: ['5–6 người'], servings: 6 }
  const FULL = 'Lẩu gà lá é cho 6 người.\n\n**Nguyên liệu**\n- 2 con gà (khoảng 2,5 kg)\n- 2 bó lá é\n- 500 g nấm\n- 1 kg bún\n\n**Cách nấu**\n1. Ướp gà 15 phút.\n2. Xào sơ cho săn.\n3. Nấu nước lẩu 25 phút.\n4. Thả lá é khi ăn.'
  it('a full recipe (quantities + numbered steps) lacks nothing', () => {
    expect(missingDeliverables(recipe, FULL)).toEqual([])
  })
  it('the live answer (ingredients named, no quantities, no steps, "công thức trên") lacks quantities and steps', () => {
    const LIVE = 'Mưa mà nấu ở nhà cho 5–6 người thì mình chốt lẩu gà lá é. Sắm 1 con gà cỡ lớn, lá é, măng, nấm, bún. Nếu pa muốn tự nấu thì công thức trên là hướng tiện nhất.'
    const m = missingDeliverables(recipe, LIVE)
    expect(m).toContain('định lượng nguyên liệu cho 6 người')
    expect(m).toContain('các bước nấu đánh số')
  })
  it('how-to needs steps; comparison needs a table or 3+ criteria; a promised table must exist', () => {
    expect(missingDeliverables({ kind: 'how_to', constraints: [], servings: null }, 'Bạn cứ làm từ từ là được.')).toEqual(['các bước làm đánh số'])
    expect(missingDeliverables({ kind: 'compare', constraints: [], servings: null }, 'A tốt hơn B.')).toHaveLength(1)
    expect(missingDeliverables({ kind: 'compare', constraints: [], servings: null }, '| Tiêu chí | A | B |\n|---|---|---|\n| Giá | rẻ | đắt |')).toEqual([])
    expect(missingDeliverables({ kind: 'knowledge', constraints: [], servings: null }, 'Xem bảng dưới nhé.')).toEqual(['cái bảng mà câu trả lời nhắc tới'])
  })
  it('the retry note names what is missing and keeps the user\'s constraints', () => {
    const n = deliverablesRetryNote(recipe, ['các bước nấu đánh số'], 'vi')
    expect(n).toContain('các bước nấu đánh số')
    expect(n).toContain('5–6 người')
  })
  it('an announced count the answer does not deliver is missing (eval 17/10 sw-1, pf-4, sh-6)', () => {
    const chat = { kind: 'place_find' as const, constraints: [], servings: null }
    expect(missingDeliverables(chat, 'Mình gợi ý 3 chỗ giá mềm:\n- **Quán A** — phở.\n- **Quán B** — bún.\n- Quán')).toEqual([])
    const SHORT = 'đủ 3 chỗ đã nói (mới có 2) — hoặc sửa con số cho khớp với số thật có, không bịa thêm'
    expect(missingDeliverables(chat, 'Mình gợi ý 3 chỗ giá mềm:\n- **Quán A** — phở.\n- **Quán B** — bún.')).toEqual([SHORT])
    // the retry that corrects the number to the two real places is complete
    expect(missingDeliverables(chat, 'Mình gợi ý 2 chỗ giá mềm:\n- **Quán A** — phở.\n- **Quán B** — bún.')).toEqual([])
    expect(missingDeliverables({ kind: 'shopping', constraints: [], servings: null }, 'Có hai lựa chọn đáng cân nhắc.\n\n**Soundcore R50i NC** — chống ồn tốt.')[0]).toMatch(/^đủ 2 lựa chọn đã nói \(mới có 1\)/)
    expect(missingDeliverables({ kind: 'recipe', constraints: [], servings: 4 }, 'Có thể gợi ý 3 kiểu nước dùng. Công thức:\n- 1 kg gà\n- 2 củ hành\n- 3 lít nước\n1. Luộc.\n2. Hớt bọt.\n3. Nêm.')).toEqual([])
  })
  it('a count inside a question, car seats, and bold-led or heading items are not a shortfall', () => {
    const k = { kind: 'chat' as const, constraints: [], servings: null }
    expect(missingDeliverables(k, 'Bạn muốn mình gợi ý thêm 2 món nữa không?')).toEqual([])
    expect(missingDeliverables(k, 'Nhà 4 người thì thuê xe 5 chỗ là vừa.')).toEqual([])
    expect(missingDeliverables(k, 'Có 2 cách:\n\n### Cách nhanh\nLàm A.\n\n### Cách kỹ\nLàm B.')).toEqual([])
  })
})

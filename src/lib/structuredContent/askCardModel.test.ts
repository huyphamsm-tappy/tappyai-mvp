import { describe, it, expect } from 'vitest'
import { composeAskAnswer, type AskQuestionView } from './parseAsk'
import { ASK_EMPTY_ANSWER, ASK_HEADER, askAreaOf, askIconOf, askSendText, askStepKind, askTileKey } from './askCardModel'

// The redesigned quick-ask card (owner 30/09) — shared web + Android spec docs/design/ask-card/README.md (R23 + R23.1).
// VIEW ONLY: these are the question sets the router really emits (consultRouter.ts) and the reply must stay the plain
// sentence the server has always read.
const Q = (id: string, q: string, options: string[]): AskQuestionView => ({ id, q, options })
const ENT = [Q('activity', 'Muốn chơi gì?', ['Karaoke', 'Xem phim', 'Bar/pub', 'Bida/bowling']), Q('party', 'Mấy người / đi với ai?', ['1 mình', '2 người', 'Nhóm 3-5', 'Nhóm đông']), Q('time', 'Đi lúc mấy giờ?', ['Chiều nay', 'Tối nay', 'Cuối tuần'])]
const FOOD = [Q('dish', 'Món gì / kiểu quán?', ['Món Việt', 'Nhật/Hàn', 'Lẩu/nướng', 'Chưa biết']), Q('mode', 'Ăn tại quán hay giao?', ['Ăn tại quán', 'Giao tận nơi']), Q('area', 'Khu vực nào?', ['Gần mình', 'Quận 1', 'Quận 3', 'Quận 7'])]
const SPA = [Q('service', 'Muốn làm dịch vụ gì?', ['Massage', 'Gội đầu dưỡng sinh', 'Xông hơi', 'Chăm sóc da']), Q('time', 'Khi nào đi?', ['Hôm nay', 'Tối nay', 'Cuối tuần'])]
const SPA_HAIR = [Q('style', 'Làm tóc gì?', ['Cắt', 'Uốn', 'Nhuộm', 'Phục hồi']), Q('time', 'Khi nào đi?', ['Hôm nay', 'Tối nay', 'Cuối tuần'])]
const TRIP = [Q('date', 'Đi khi nào, mấy ngày?', ['Cuối tuần 2N1Đ', '3N2Đ', '4-5 ngày', 'Chưa chốt']), Q('origin', 'Xuất phát từ đâu?', ['TP.HCM', 'Hà Nội', 'Đà Nẵng', 'Nơi khác']), Q('style', 'Thích kiểu gì?', ['Biển', 'Núi', 'Ăn uống', 'Nghỉ dưỡng'])]
const HOTEL = [Q('party', 'Mấy người?', ['1 người', '2 người', 'Gia đình', 'Nhóm bạn']), Q('budget', 'Tầm giá mỗi đêm?', ['Dưới 700k', '700k-1,5tr', '1,5-3tr', 'Trên 3tr'])]
const SHOP = [Q('line', 'Loại nào?', ['Nhét tai', 'Chụp tai', 'Chưa biết']), Q('budget', 'Tầm giá bao nhiêu?', ['Dưới 1tr', '1-3tr', '3-5tr', 'Trên 5tr']), Q('must', 'Cần chống ồn không?', ['Có chống ồn', 'Không cần'])]

describe('askCardModel — README §2: kinds from `id` first, then the words of `q`', () => {
  it('infers the area of each of the 5 areas (R23.1 header)', () => {
    expect([ENT, FOOD, SPA, SPA_HAIR, TRIP, HOTEL, SHOP].map(askAreaOf)).toEqual(['entertainment', 'food', 'spa', 'spa', 'travel', 'travel', 'shopping'])
    expect(ASK_HEADER.entertainment.title).toBe('Tìm gì cho bạn hôm nay?')
    expect(ASK_HEADER.entertainment.sub).toBe('Chọn nhanh vài thứ, Tappy sẽ tìm phần còn lại.')
  })
  it('LOẠI / AI ĐI / KHI NÀO / NGÂN SÁCH / KHÁC', () => {
    expect(ENT.map(askStepKind)).toEqual(['type', 'party', 'time'])
    expect(FOOD.map(askStepKind)).toEqual(['type', 'other', 'other'])
    expect(SPA.map(askStepKind)).toEqual(['type', 'time'])
    expect(TRIP.map(askStepKind)).toEqual(['time', 'other', 'type'])
    expect(HOTEL.map(askStepKind)).toEqual(['party', 'budget'])
    expect(SHOP.map(askStepKind)).toEqual(['type', 'budget', 'other'])
    expect(askStepKind(Q('x', 'Bạn thích thể loại nào?', ['a', 'b']))).toBe('type')
    expect(askStepKind(Q('x', 'Đi với ai?', ['a', 'b']))).toBe('party')
  })
})

describe('askCardModel — README §3: tile image keys and icons', () => {
  it('the owner-named keys from the place-type image library', () => {
    expect(ENT[0].options.map(askTileKey)).toEqual(['diem-karaoke', 'diem-rap-phim', 'diem-bar-rooftop', 'diem-bida'])
    expect(['Bowling', 'Cafe/rooftop', 'Trà sữa', 'Lẩu/nướng', 'Nhật/Hàn', 'Món Việt', 'Phở/bún', 'Ăn uống'].map(askTileKey))
      .toEqual(['diem-bowling', 'diem-cafe', 'diem-cafe', 'diem-lau-nuong', 'diem-mon-nhat-han', 'diem-quan-an', 'diem-quan-an', 'diem-quan-an'])
    expect(['Massage', 'Gội đầu dưỡng sinh', 'Sơn gel', 'Biển', 'Núi', 'Rap / hip-hop'].map(askTileKey))
      .toEqual(['diem-spa', 'diem-spa', 'diem-son-gel', 'diem-bien', 'diem-nui', 'diem-am-nhac'])
  })
  it('words that collide once the marks are dropped are matched with their marks', () => {
    expect(askTileKey('Dạo phố')).toBe('diem-dao-pho') // phố ≠ phở
    expect(askTileKey('Pin lâu')).toBe('diem-pin-lau') // lâu ≠ lẩu
    expect(askTileKey('Đỏ')).toBe('diem-do') // đỏ ≠ đồ
    expect(askTileKey('Làm nail')).toBe('diem-nail')
  })
  it('"not sure" options get no image; unknown options get the same-name placeholder key', () => {
    expect(askTileKey('Chưa biết')).toBeNull()
    expect(askTileKey('Không quan trọng')).toBeNull()
    expect(askTileKey('Chăm sóc da')).toBe('diem-cham-soc-da')
    expect(askIconOf('Chưa biết', 'type')).toBe('HelpCircle')
  })
  it('party / time / budget icons', () => {
    expect(ENT[1].options.map(o => askIconOf(o, 'party'))).toEqual(['User', 'Users', 'UsersRound', 'UsersRound'])
    expect(ENT[2].options.map(o => askIconOf(o, 'time'))).toEqual(['Sun', 'Moon', 'CalendarDays'])
    expect(askIconOf('3N2Đ', 'time')).toBe('CalendarDays')
    expect(askIconOf('Dưới 1tr', 'budget')).toBe('Wallet')
    expect(FOOD[2].options.map(o => askIconOf(o, 'other'))).toEqual(['MapPin', 'MapPin', 'MapPin', 'MapPin'])
  })
})

describe('the reply the card sends (README §0 — unchanged for the server)', () => {
  it('merges a multi-choice LOẠI step, single choices and typed text in question order', () => {
    const chosen = { time: 'Tối nay', activity: ['Bida/bowling', 'Karaoke'], party: '2 người' }
    expect(composeAskAnswer(ENT, chosen, '  ít ồn ')).toBe('Karaoke, Bida/bowling · 2 người · Tối nay · ít ồn')
    expect(askSendText(ENT, chosen)).toBe('Karaoke, Bida/bowling · 2 người · Tối nay')
  })
  it('a partial answer is fine; cleared choices are skipped; only typed text sends only that', () => {
    expect(askSendText(FOOD, { dish: [], mode: '', area: 'Quận 3' })).toBe('Quận 3')
    expect(askSendText(FOOD, {}, 'không cay')).toBe('không cay')
  })
  it('sending with nothing chosen still searches (R23.1)', () => {
    expect(askSendText(ENT, {}, '   ')).toBe(ASK_EMPTY_ANSWER)
    expect(ASK_EMPTY_ANSWER).toBe('Tìm cho tôi')
  })
})

// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// Gate 2 Track A (B1, PROPOSAL): isSingleServiceRequest -- one service family (stay XOR food) and no plan request. The regression matrix
// texts (gate2/TRACK-A-DESIGN.md) and the common phrasings of each family. A city, a number of nights or "du lịch" never decides.
import { describe, it, expect } from 'vitest'
import { isSingleServiceRequest, serviceRequestParts } from './serviceRequest'

describe('regression matrix: service request vs plan request', () => {
  for (const [id, text, expected] of [
    ['R-3', 'đi Sài Gòn du lịch, tối nay ăn buffet quận 3 dưới 500k', true],
    ['H-2', 'khách sạn Hà Nội tối nay 1 đêm dưới 1 triệu', true],
    ['H3', 'tìm khách sạn Đà Nẵng 2 đêm gần biển', true],
    ['H4', 'đặt phòng Đà Lạt 3 đêm cuối tuần này', true],
    ['H5', 'hotel in Da Nang for 2 nights', true],
    ['H6', 'homestay Sapa 1 đêm', true],
    ['F2', 'đang du lịch Đà Nẵng, quán hải sản nào ngon', true],
    ['F5', 'đi Hà Nội 2 ngày, quán phở nào ngon', true],
    ['M1', 'khách sạn nào gần chợ đêm?', true],
    ['M4', 'đi du lịch Nha Trang, tìm khách sạn 2 đêm gần biển', true],
    ['T1', 'lên kế hoạch đi Nha Trang đi đôi, ăn chay, 3 ngày 2 đêm cuối tuần sau', false],
    ['T2', 'đi du lịch Đà Nẵng 3 ngày 2 đêm', false],
    ['T3', 'Đi Đà Lạt cuối tuần này', false],
    ['T4', 'Lập kế hoạch đi chơi cuối tuần', false],
    ['T5', 'lịch trình Phú Quốc 4 ngày 3 đêm cho gia đình', false],
    ['T6', 'plan a 3-day trip to Hoi An', false],
    ['T7', 'chưa biết đi đâu, tầm 3 ngày', false],
    ['T8', 'thêm 1 ngày nữa', false],
    ['M2', 'đi Đà Lạt 3 ngày, gợi ý khách sạn và quán ăn', false],
    ['M3', 'tìm khách sạn và lên lịch trình 2 ngày ở Huế', false],
  ] as const) {
    it(`${id}: ${expected ? 'service request' : 'not a single-service request'}`, () => {
      expect(isSingleServiceRequest(text)).toBe(expected)
    })
  }
})

describe('common phrasings of each family', () => {
  it('stay', () => {
    for (const t of ['khách sạn gần biển', 'ks Đà Nẵng 2 đêm', 'đặt phòng Vũng Tàu', 'thuê phòng 1 đêm', 'homestay Đà Lạt', 'resort Phú Quốc', 'villa Vũng Tàu cho 10 người', 'nhà nghỉ gần bến xe', 'hostel Hội An', 'chỗ ở gần phố cổ', 'nơi ở Sapa', 'tối nay ngủ ở đâu', 'where to stay in Hue', 'cheap hotels in Hanoi']) {
      expect(serviceRequestParts(t), t).toMatchObject({ stay: true, food: false, plan: false })
      expect(isSingleServiceRequest(t), t).toBe(true)
    }
  })
  it('food', () => {
    for (const t of ['quán ăn ngon Huế', 'nhà hàng hải sản Vũng Tàu', 'ăn gì ở Đà Lạt', 'ăn ở đâu gần Hồ Gươm', 'món ngon Hội An', 'đặc sản Nha Trang', 'quán phở ngon', 'quán bún bò Huế', 'quán lẩu cho 6 người', 'quán nướng quận 7', 'quán ốc ngon', 'quán chay quận 1', 'quán nhậu bình dân', 'quán cà phê đẹp', 'cafe yên tĩnh làm việc', 'buffet dưới 500k', 'where to eat in Hoi An', 'best restaurants in Saigon']) {
      expect(serviceRequestParts(t), t).toMatchObject({ stay: false, food: true, plan: false })
      expect(isSingleServiceRequest(t), t).toBe(true)
    }
  })
  it('a plan request is never a single-service request, even with one service named', () => {
    for (const t of ['lên kế hoạch ăn uống ở Hà Nội 2 ngày', 'lịch trình 3 ngày kèm khách sạn', 'lên lịch đi Huế, gợi ý khách sạn', 'plan my trip and find a hotel', 'itinerary for Da Lat with restaurants']) {
      expect(serviceRequestParts(t).plan, t).toBe(true)
      expect(isSingleServiceRequest(t), t).toBe(false)
    }
  })
  it('two families at once is a plan of several parts, not one service', () => {
    for (const t of ['gợi ý khách sạn và quán ăn ở Huế', 'hotel and restaurants in Da Nang', 'homestay với quán cà phê đẹp Đà Lạt']) {
      expect(isSingleServiceRequest(t), t).toBe(false)
    }
  })
  it('a district number is not food ("quận" folds to "quan"); a city, nights or "du lịch" alone decide nothing', () => {
    for (const t of ['đi chơi quận 1', 'quận 3 có gì vui', 'đi du lịch Đà Nẵng', 'Hà Nội 2 đêm', 'Sài Gòn cuối tuần', '']) {
      expect(isSingleServiceRequest(t), t).toBe(false)
    }
  })
})

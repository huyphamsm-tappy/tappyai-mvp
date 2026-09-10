// Single source of truth for every language-dependent string that is NOT model-generated
// prose — tool notes/errors/fallbacks/labels built server-side and handed to the LLM as
// tool-result data. Root cause this prevents: these used to be hardcoded Vietnamese
// regardless of the detected response language (see [[project_ai_language_following_fix]]).
//
// Only 'vi' has a hand-written translation; every other lang code (en, ja, ko, zh, ar,
// th, ...) resolves to the English set. English is a safe neutral base for the model to
// translate further when lang is ja/ko/zh/ar/th — unlike Vietnamese, English was never
// this pipeline's hardcoded default, so it never competes with the language-override
// instruction in promptBuilder.ts the way the original bug did.
export type Lang = string

export const isVi = (lang: Lang) => lang === 'vi'

export const messages = {
  weather: {
    fetchError: (lang: Lang) => isVi(lang) ? 'Khong lay duoc du lieu thoi tiet luc nay' : "Couldn't fetch weather data right now",
    seeAt: (lang: Lang, url: string) => isVi(lang) ? `Xem thoi tiet tai: ${url}` : `See the weather at: ${url}`,
  },
  gold: {
    unit: (lang: Lang) => isVi(lang)
      ? 'VND/luong cho vang trong nuoc (1 luong = 10 chi = 37.5g), USD/oz cho vang the gioi (XAUUSD)'
      : 'VND/tael for domestic gold (1 tael = 10 chi = 37.5g), USD/oz for world gold (XAUUSD)',
    fetchError: (lang: Lang) => isVi(lang) ? 'Khong lay duoc gia vang luc nay' : "Couldn't fetch gold prices right now",
    seeAt: (lang: Lang, url: string) => isVi(lang) ? `Xem gia vang tai: ${url}` : `See gold prices at: ${url}`,
  },
  news: {
    latest: (lang: Lang) => isVi(lang) ? 'Moi nhat' : 'Latest',
    noResults: (lang: Lang) => isVi(lang) ? 'Khong tim thay tin tuc lien quan' : 'No related news found',
    fetchError: (lang: Lang) => isVi(lang) ? 'Khong the tai tin tuc' : "Couldn't load news",
  },
  places: {
    /**
     * 🚨 NO LOCATION, AND NO RIGHT TO GUESS ONE.
     *
     * `searchPlacesOSM` used to open with `const loc = location || 'Ha Noi'`, so
     * "Quan cafe view dep" with no location and no GPS silently became a Hanoi
     * search - and the reply recommended Hanoi cafes without ever saying Hanoi
     * was assumed. This is what the tool says instead, and it is an INSTRUCTION
     * to ask, never a result to describe.
     */
    /**
     * 🚨 THE COORDINATES SILENTLY STAYED IN HANOI.
     *
     * A city with no entry in the preset table is geocoded through Nominatim,
     * and the `catch` around it left `lat`/`lon` at their initialisers - Hanoi's.
     * So an unresolvable or slow-to-resolve city searched HANOI while the result
     * still reported the user's city, which is the same fabrication as the
     * default-city bug wearing different clothes.
     */
    locationUnresolved: (lang: Lang, place: string) => isVi(lang)
      ? `KHONG XAC DINH DUOC TOA DO cua "${place}". KHONG tim o thanh pho khac va KHONG noi da tim o "${place}". Hay noi that la chua tra cuu duoc khu vuc nay va hoi user noi ro hon (vd ten tinh/thanh pho).`
      : `COULD NOT RESOLVE "${place}" to coordinates. Do NOT search a different city and do NOT claim "${place}" was searched. Say plainly that the area could not be looked up and ask the user to be more specific.`,
    locationRequired: (lang: Lang) => isVi(lang)
      ? 'CHUA CO KHU VUC. User khong noi khu vuc va khong co vi tri thiet bi. TUYET DOI KHONG tu chon mot thanh pho nao (Ha Noi, TP HCM, Quy Nhon...), KHONG noi "khong tim thay o <thanh pho>". Hay hoi NGAN GON user muon tim o khu vuc nao.'
      : 'NO AREA GIVEN. The user named no area and there is no device location. Do NOT pick a city yourself and do NOT say "no results in <city>". Ask the user briefly which area they mean.',
    noOsmData: (lang: Lang, url: string) => isVi(lang) ? `OSM khong co du lieu. Tim them: ${url}` : `No OSM data available. Search more: ${url}`,
    osmSourceNote: (lang: Lang, url: string) => isVi(lang) ? `Du lieu tu OpenStreetMap. Xem them: ${url}` : `Data from OpenStreetMap. See more: ${url}`,
    searchOnMaps: (lang: Lang, url: string) => isVi(lang) ? `Tim kiem tren Google Maps: ${url}` : `Search on Google Maps: ${url}`,
    rating: (lang: Lang, avg: number, count: number) => isVi(lang)
      ? `${avg}/5 (${count} nguoi dung TappyAI da danh gia)`
      : `${avg}/5 (${count} TappyAI users rated this)`,
    googleRating: (lang: Lang, rating: number, count: number | undefined) => {
      const countStr = isVi(lang) ? (count?.toLocaleString('vi-VN') ?? count) : (count?.toLocaleString('en-US') ?? count)
      return isVi(lang) ? `${rating}⭐ (${countStr} đánh giá Google Maps)` : `${rating}⭐ (${countStr} Google Maps reviews)`
    },
    priceNote: (lang: Lang) => isVi(lang)
      ? 'Gia tham khao tu ket qua tim kiem hien tai (menu/dich vu/ve...), co the khac theo chi nhanh, thoi diem va da thay doi theo thoi gian.'
      : 'Prices are for reference from current search results (menu/service/ticket...) and may vary by branch, time, or change over time.',
    /**
     * Carried on a place result that retrieved NOTHING, so the model is told in the result
     * itself rather than left to infer it. The stream gate enforces the same rule afterwards;
     * this is what lets the reply be honest in the first place instead of merely censored.
     */
    noResultsInstruction: (lang: Lang) => isVi(lang)
      ? 'KHONG tim thay dia diem nao cho yeu cau nay. TUYET DOI KHONG duoc neu ten bat ky dia diem, dia chi hay gia nao — khong co du lieu nao de dua vao. Hay noi thang la chua tim thay, va co the goi y mo rong khu vuc hoac doi tu khoa.'
      : 'NO places were found for this request. Do NOT name any venue, address or price — there is no data behind them. Say plainly that nothing was found, and you may suggest widening the area or changing the keywords.',
  },
  shopping: {
    priceDisclaimer: (lang: Lang) => isVi(lang)
      ? 'Gia tham khao tu ket qua tim kiem hien tai, co the da thay doi theo thoi gian va phien ban san pham - bam link de xem gia chinh xac va mua hang.'
      : 'Prices are for reference from current search results and may have changed over time or by product variant — tap the link for the exact price and to buy.',
    fallbackNote: (lang: Lang, query: string) => isVi(lang)
      ? `Tim "${query}" tren cac san thuong mai dien tu Viet Nam`
      : `Search "${query}" on Vietnamese e-commerce platforms`,
  },
  webSearch: {
    noAutoResults: (lang: Lang, query: string, url: string) => isVi(lang)
      ? `Khong tim thay ket qua tu dong cho "${query}". HAY hien thi link sau cho user de tu tim: ${url}`
      : `No automatic results found for "${query}". Show the user this link so they can search themselves: ${url}`,
    unavailable: (lang: Lang, url: string) => isVi(lang)
      ? `Khong the tim kiem tu dong luc nay. HAY hien thi link sau cho user de tu tim: ${url}`
      : `Automatic search is unavailable right now. Show the user this link so they can search themselves: ${url}`,
  },
  flights: {
    unknownAirport: (lang: Lang) => isVi(lang) ? 'Khong nhan dien duoc san bay tu ten dia diem' : "Couldn't recognize an airport from that place name",
    findOnPlatforms: (lang: Lang) => isVi(lang) ? 'Tim chuyen bay tren cac nen tang tren' : 'Find flights on the platforms above',
    notConfigured: (lang: Lang) => isVi(lang) ? 'Chua cau hinh API gia ve may bay' : 'Flight price API is not configured',
    source: () => 'Travelpayouts (Aviasales)',
    cheapestNote: (lang: Lang) => isVi(lang)
      ? 'Day la gia ve re gan nhat ma he thong tim duoc cho tuyen nay (khong chac dung ngay user hoi), gia co the da thay doi - bam link de xem gia chinh xac va dat ve theo ngay cu the.'
      : "This is the cheapest fare the system found for this route (not necessarily the exact date asked) and prices may have changed — tap the link for the exact price and to book a specific date.",
    fetchError: (lang: Lang) => isVi(lang) ? 'Khong lay duoc gia ve may bay luc nay' : "Couldn't fetch flight prices right now",
  },
  hotels: {
    sourceSerperOsm: () => 'Google Search (Serper) + OpenStreetMap',
    sourceDdgOsm: (lang: Lang) => isVi(lang) ? 'Tim kiem web (DuckDuckGo) + OpenStreetMap' : 'Web search (DuckDuckGo) + OpenStreetMap',
    priceDisclaimer: (lang: Lang) => isVi(lang)
      ? 'Gia trong search_results la tham khao tu ket qua tim kiem hien tai, co the khong dung loai phong/ngay user hoi va da thay doi - bam booking_link de xem gia chinh xac realtime theo ngay cu the.'
      : 'Prices in search_results are for reference from current search results, may not match the exact room type/date asked, and may have changed — tap booking_link for the exact real-time price for specific dates.',
    noData: (lang: Lang) => isVi(lang)
      ? `Khong tim duoc thong tin gia phong luc nay`
      : `Couldn't find room price info right now`,
    seeBookingAt: (lang: Lang, url: string) => isVi(lang) ? `Xem va dat phong tai: ${url}` : `See and book at: ${url}`,
    fetchError: (lang: Lang) => isVi(lang) ? 'Khong lay duoc gia phong khach san luc nay' : "Couldn't fetch hotel prices right now",
  },
  transport: {
    intercityDisclaimer: (lang: Lang) => isVi(lang)
      ? 'Gia/chuyen xe-tau la tham khao tu ket qua tim kiem hien tai, co the khac theo gio chay, loai ghe va da thay doi.'
      : 'Bus/train prices and schedules are for reference from current search results, may vary by departure time and seat class, and may have changed.',
    noIntercityResults: (lang: Lang) => isVi(lang) ? 'Khong tim duoc ve xe khach/tau luc nay' : "Couldn't find bus/train tickets right now",
    unknownDistance: (lang: Lang) => isVi(lang)
      ? 'Khong xac dinh duoc chinh xac khoang cach cho 2 dia diem nay luc nay'
      : "Couldn't determine the exact distance between these two places right now",
    openAppForExact: (lang: Lang) => isVi(lang)
      ? 'Mo app Grab/Be/Xanh SM va nhap dia chi cu the de app tinh khoang cach + gia chinh xac tu vi tri thuc te.'
      : 'Open the Grab/Be/Xanh SM app and enter the exact address so it can calculate distance + exact price from the real location.',
    estimateDisclaimer: (lang: Lang) => isVi(lang)
      ? 'Day la gia UOC TINH theo khoang cach duong chim va don gia trung binh xe 4 cho, KHONG phai gia chinh xac tu app - mo app de xem gia thuc te (co the cong them phi gio cao diem, phi cau duong...) va dat xe.'
      : 'This is an ESTIMATED price based on straight-line distance and an average 4-seat-car rate, NOT the exact app price — open the app to see the real price (may include peak-hour/toll fees) and book.',
    unableToEstimate: (lang: Lang) => isVi(lang) ? 'Khong uoc tinh duoc khoang cach/gia xe luc nay' : "Couldn't estimate distance/fare right now",
  },
}

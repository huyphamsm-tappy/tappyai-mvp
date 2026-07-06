// Wave-3 dictionary module — Deals screen (src/app/deals). Flat vi/en maps,
// keys namespaced under "deals." so the object-spread merge stays collision-free.

export const vi: Record<string, string> = {
  'deals.title': 'Deal hôm nay',
  'deals.subtitle': 'Tappy chọn lọc {count} ưu đãi tốt nhất — cập nhật mỗi ngày lúc 7:30 sáng',
  'deals.viaSource': 'via {source}',
  'deals.footerHint': 'Deals thay đổi mỗi ngày • Bật thông báo để nhận lúc 7:30 sáng',
  'deals.disclosurePrefix': 'Đây là ưu đãi từ các nền tảng TMĐT/đối tác — Tappy tổng hợp giúp bạn, ',
  'deals.disclosureEmphasis': 'không phải quảng cáo trả tiền',
  'deals.disclosureSuffix': '. Giá & ưu đãi theo công bố của nền tảng, có thể thay đổi — bạn tự kiểm tra khi mua.',
}

export const en: Record<string, string> = {
  'deals.title': "Today's deals",
  'deals.subtitle': 'Tappy hand-picks the {count} best deals — refreshed every day at 7:30 AM',
  'deals.viaSource': 'via {source}',
  'deals.footerHint': 'Deals change daily • Turn on notifications to get them at 7:30 AM',
  'deals.disclosurePrefix': 'These are offers from e-commerce platforms and partners — Tappy curates them for you, ',
  'deals.disclosureEmphasis': 'not paid advertising',
  'deals.disclosureSuffix': '. Prices and offers are as published by each platform and may change — please double-check before you buy.',
}

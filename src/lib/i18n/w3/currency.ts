// Wave-3 dictionary module — Currency converter screen (/currency).
// Flat namespaced maps, merged into useTranslation via the w3 index.
export const vi: Record<string, string> = {
  'currency.title': 'Đổi tiền tệ',
  'currency.amountLabel': 'Số tiền',
  'currency.amountPlaceholder': 'Nhập số tiền...',
  'currency.fromLabel': 'Từ',
  'currency.toLabel': 'Sang',
  'currency.swapDirection': 'Đổi chiều',
  'currency.loadingRates': 'Đang tải tỷ giá...',
  'currency.emptyPrompt': 'Nhập số tiền để xem kết quả',
  'currency.missingRate': 'Không có tỷ giá cho {code}. Vui lòng chọn đồng tiền khác.',
  'currency.fallbackNotice': 'Đang dùng tỷ giá ước tính (không kết nối được nguồn dữ liệu)',
  'currency.ratesUpdated': 'Tỷ giá cập nhật {date} · Nguồn: open.er-api.com',
  'currency.disclaimer': 'Tỷ giá chỉ mang tính tham khảo, không dùng cho giao dịch tài chính.',
}

export const en: Record<string, string> = {
  'currency.title': 'Currency converter',
  'currency.amountLabel': 'Amount',
  'currency.amountPlaceholder': 'Enter an amount...',
  'currency.fromLabel': 'From',
  'currency.toLabel': 'To',
  'currency.swapDirection': 'Swap direction',
  'currency.loadingRates': 'Loading exchange rates...',
  'currency.emptyPrompt': 'Enter an amount to see the result',
  'currency.missingRate': 'No exchange rate available for {code}. Please pick another currency.',
  'currency.fallbackNotice': 'Using estimated rates (could not reach the data source)',
  'currency.ratesUpdated': 'Rates updated {date} · Source: open.er-api.com',
  'currency.disclaimer': 'Rates are for reference only, not for financial transactions.',
}

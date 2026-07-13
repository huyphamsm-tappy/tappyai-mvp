# TappyAI Back Office — Multi-Language Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Design i18n architecture for the Back Office Platform that supports Vietnamese and English with clean extension to future languages.

---

## 2. Supported Languages

| Language | Code | Status |
|---|---|---|
| Vietnamese | `vi` | Primary (default) |
| English | `en` | Secondary |

---

## 3. Architecture

The Back Office uses the **same i18n foundation** as the main app (`dictionaries.ts` + `useSyncExternalStore` pattern, already implemented).

### Dictionary Location

```
src/
└── dictionaries/
    ├── vi.ts          ← Existing (main app)
    ├── en.ts          ← Existing (main app)
    └── admin/
        ├── vi.ts      ← Back office strings (new)
        └── en.ts      ← Back office strings (new)
```

Back office dictionaries are kept separate from main app to avoid bloating the main app bundle.

### Dictionary Structure

```typescript
// src/dictionaries/admin/vi.ts
export const adminDict = {
  nav: {
    home: 'Trang chủ',
    analytics: 'Phân tích',
    users: 'Người dùng',
    moderation: 'Kiểm duyệt',
    engagement: 'Chiến dịch',
    crm: 'Quan hệ khách hàng',
    reports: 'Báo cáo',
    audit: 'Nhật ký kiểm tra',
    settings: 'Cài đặt',
  },
  users: {
    list_title: 'Quản lý người dùng',
    search_placeholder: 'Tìm kiếm theo tên, email...',
    status_active: 'Hoạt động',
    status_suspended: 'Bị đình chỉ',
    status_banned: 'Bị cấm',
    action_suspend: 'Đình chỉ',
    action_ban: 'Cấm vĩnh viễn',
    action_unban: 'Khôi phục',
    confirm_suspend_title: 'Xác nhận đình chỉ người dùng?',
    confirm_suspend_body: 'Người dùng sẽ bị đăng xuất và không thể truy cập ứng dụng.',
  },
  moderation: {
    queue_title: 'Hàng đợi kiểm duyệt',
    priority_urgent: 'Khẩn cấp',
    priority_high: 'Cao',
    priority_normal: 'Bình thường',
    action_dismiss: 'Bỏ qua',
    action_warn: 'Cảnh báo',
    action_hide: 'Ẩn nội dung',
    action_delete: 'Xóa nội dung',
  },
  analytics: {
    dau: 'Người dùng hoạt động hàng ngày',
    mau: 'Người dùng hoạt động hàng tháng',
    new_users: 'Người dùng mới',
    revenue: 'Doanh thu',
    ai_cost: 'Chi phí AI',
    retention: 'Giữ chân người dùng',
  },
  // ... all modules
}
```

---

## 4. Language Switcher

The Back Office has a language switcher in the top navigation bar.

- Default: Vietnamese
- User preference stored in `localStorage` key `admin_language`
- No server round-trip needed — all strings are in client-side dictionaries

---

## 5. Report Language

Reports (PDF, Excel, Word) render in the selected language at generation time.

The report generation API accepts a `language` parameter:

```json
{ "report_type": "investor", "format": "pdf", "language": "en" }
```

Report templates contain both `vi` and `en` string keys and render based on this parameter.

---

## 6. Rules for No Hardcoded Strings

All user-visible strings in admin UI components must:
1. Come from the dictionary
2. Use the `t('key')` pattern via the `useAdminTranslation()` hook

No string literals in JSX except developer-facing debug output.

---

## 7. Date, Number, and Currency Formatting

| Value | Vietnamese Format | English Format |
|---|---|---|
| Date | 12/07/2026 | 07/12/2026 |
| Long date | 12 tháng 7, 2026 | July 12, 2026 |
| Number | 1.250.000 | 1,250,000 |
| Currency | 120.000 VND | $120.00 USD |
| Percentage | 18,3% | 18.3% |

Use `Intl.NumberFormat` and `Intl.DateTimeFormat` with `locale` parameter.

```typescript
const formatNumber = (n: number, lang: 'vi' | 'en') =>
  new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(n)
```

---

## 8. Adding a New Language

To add a third language (e.g. English + Thai in future):

1. Create `src/dictionaries/admin/th.ts` with all keys from `vi.ts`
2. Add `'th'` to the `AdminLanguage` type
3. Add to language switcher dropdown
4. Add locale config for date/number formatting

No code changes needed in components — they consume from the dictionary generically.

---

*End of Multi-Language Architecture*

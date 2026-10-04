// The ONE canonical source of the Scam Shield EMERGENCY scam-reporting hotline and its official source (Web "Nghi bị lừa?" card).
//
// Scope: this is the national scam-REPORTING line only. The per-brand hotlines (`directory/officialDirectory.ts`, `entity.hotline`) serve a
// different purpose (calling the brand that was impersonated) and are NOT read from here and do not read from here.
//
// Source: Cục Cảnh sát hình sự - Bộ Công an, "Đường dây nóng tiếp nhận tin báo, tố giác về lừa đảo". The URL is the canonical page, with no
// tracking parameters, and it is never rendered as visible text (only the words "Bộ Công an" are the link).

export const SCAM_REPORT_HOTLINE = {
  /** Shown to the person. */
  display: '0692.345.860',
  /** One tap / click opens the phone handler. No spaces, no dots. */
  tel: 'tel:0692345860',
  /** Official source page. */
  sourceUrl: 'https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/',
} as const

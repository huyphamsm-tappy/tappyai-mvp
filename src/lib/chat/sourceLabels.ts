// CONSULT_V3 (owner 17/10, UAT đợt A: source chips): the outlet name a news source chip shows instead of its bare host ("vnexpress.net" →
// "VnExpress"). Brand names, not UI copy — kept here (src/lib) so the chat renderer imports them (ChatInterface linkLabelFor).
export const NEWS_SOURCE_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)(vnexpress\.net)$/, 'VnExpress'],
  [/(^|\.)(tuoitre\.vn)$/, 'Tuổi Trẻ'],
  [/(^|\.)(dantri\.com\.vn)$/, 'Dân trí'],
  [/(^|\.)(thanhnien\.vn)$/, 'Thanh Niên'],
  [/(^|\.)(vietnamnet\.vn)$/, 'VietNamNet'],
  [/(^|\.)(znews\.vn)$/, 'Znews'],
]

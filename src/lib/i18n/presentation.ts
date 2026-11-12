// Response presentation (RFC-001 section 4; build flag NEXT_PUBLIC_RESPONSE_PRESENTATION): the words of the research document's table of contents,
// toolbar and progressive sections. One table of [vi, en] pairs split into the two locale maps. Keys are prefixed `pres.`. Placeholders use {name}.

const T: Record<string, [string, string]> = {
  'pres.toc.nav': ['Mục lục báo cáo', 'Report contents'],
  'pres.toc.button': ['Mục lục · {n} mục', 'Contents · {n} sections'],
  'pres.toc.current': ['Đang đọc: {title}', 'Reading: {title}'],
  'pres.toc.pending': ['Đang viết…', 'Writing…'],
  'pres.toolbar.label': ['Công cụ báo cáo', 'Report tools'],
  'pres.pdf': ['Xuất PDF', 'Export PDF'],
  'pres.copyMd': ['Sao chép Markdown', 'Copy Markdown'],
  'pres.copied': ['Đã sao chép', 'Copied'],
  'pres.share': ['Chia sẻ', 'Share'],
  'pres.pending': ['Đang kiểm chứng và viết mục tiếp theo…', 'Checking and writing the next section…'],
  'pres.pendingNamed': ['Đang kiểm chứng và viết: {title}', 'Checking and writing: {title}'],
  'pres.amended': ['Mục này vừa được cập nhật sau khi kiểm chứng lại.', 'This section was just updated after being checked again.'],
  'pres.cite': ['Nguồn {n}', 'Source {n}'],
  'pres.backToText': ['Quay lại chỗ trích dẫn', 'Back to where it is cited'],
  'pres.sources.list': ['Danh sách nguồn', 'List of sources'],
}

export const vi: Record<string, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[0]]))
export const en: Record<string, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[1]]))

// ── CONSULTATIVE_IN_AGENT — landmarks for a destination the city table does not know come from the web, not from a map centred elsewhere ──
//
// Measured live (2026-10-11): for "Lý Sơn" and "Côn Đảo" the map searches inside get_trip_data had no city centre (the table in
// tools/vietnamCities.ts lists 20-odd cities) and fell back to Ho Chi Minh City (food.ts defaultCentre) — rows from the wrong province, which
// the area guards then rightly dropped. The plan had no sourced landmark, and 6 of the turn's 10 credits were already spent on those searches.
// For such a destination the runtime now (1) tells get_trip_data not to run the two map searches (hotel prices only), and (2) runs ONE web
// search for the destination's landmarks and reads the best pages — the same research web_search, so the pages are in the evidence ledger and
// the model cites them [S#]. A destination the table knows is untouched; so is a turn without a web search tool.

import { cityInText, cityForName } from '@/lib/ai/tools/vietnamCities'

type Exec = (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>

export const isMappedDestination = (dest: string): boolean => !!(cityForName(dest) || cityInText(dest))

export function withTripLandmarks(primary: Exec, webSearch: Exec | null, o: { lang: string; onFallback?: (d: { dest: string; ok: boolean }) => void }): Exec {
  return async (args, ctx) => {
    const dest = typeof args.destination === 'string' ? args.destination.trim() : ''
    if (!dest || !webSearch || isMappedDestination(dest)) return primary(args, ctx)
    const [trip, web] = await Promise.all([
      primary({ ...args, skipPlaces: true }, ctx),
      webSearch({ queries: [`địa điểm tham quan nổi tiếng ${dest}`, `${dest} đi chơi gì ăn gì`], read: 2, focus: `địa điểm tham quan ${dest}`, kind: 'other' }, ctx).catch(() => null),
    ])
    o.onFallback?.({ dest, ok: !!web })
    const base = trip && typeof trip === 'object' && !Array.isArray(trip) ? trip as Record<string, unknown> : {}
    const en = o.lang === 'en'
    return {
      ...base,
      landmarks_web: web ?? { tool_state: 'ERROR', error: 'search_failed' },
      landmarks_note: web
        ? (en ? 'The map does not locate this destination, so landmarks come from web pages. Name only places those pages state (cite them as [S#]); no price, hours or ticket unless a page states it.' : 'Bản đồ không định vị được điểm đến này nên địa danh lấy từ trang web đã đọc. Chỉ nêu địa danh các trang đó ghi (trích bằng [S#]); không nêu giá, giờ mở cửa hay vé nếu trang không ghi.')
        : (en ? 'No landmark source could be read: describe the plan in general terms and say the stops are not verified.' : 'Không đọc được nguồn địa danh: lập kế hoạch ở mức tổng quát và nói rõ các điểm dừng chưa xác minh.'),
    }
  }
}

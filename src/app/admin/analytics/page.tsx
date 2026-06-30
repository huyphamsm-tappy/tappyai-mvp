import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin'

export default async function AnalyticsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdmin(user?.id)) redirect('/reviews')

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [uploadsRes, viewsRes, hashtagsRes, dauRes, growthRes] = await Promise.all([
    supabase.from('reviews').select('id', { count: 'exact', head: true }).or('is_hidden.is.null,is_hidden.eq.false'),
    supabase.from('reviews').select('view_count, watch_time_avg').eq('content_type', 'video').or('is_hidden.is.null,is_hidden.eq.false'),
    supabase.from('reviews').select('hashtags').not('hashtags', 'is', null).or('is_hidden.is.null,is_hidden.eq.false').limit(500),
    supabase.from('review_interactions').select('user_id').gte('created_at', since24h),
    supabase.from('reviews').select('created_at').gte('created_at', since7d).or('is_hidden.is.null,is_hidden.eq.false'),
  ])

  // Video stats
  const videoRows = viewsRes.data || []
  const totalVideoViews = videoRows.reduce((s, r) => s + (r.view_count || 0), 0)
  const avgWatchTimeSec = videoRows.length > 0
    ? Math.round(videoRows.reduce((s, r) => s + (r.watch_time_avg || 0), 0) / videoRows.length)
    : 0

  // Top hashtags
  const freq = new Map<string, number>()
  for (const row of hashtagsRes.data || []) {
    for (const tag of (row.hashtags || []) as string[]) freq.set(tag, (freq.get(tag) || 0) + 1)
  }
  const topHashtags = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  // DAU from review_interactions
  const dau = new Set((dauRes.data || []).map(x => x.user_id)).size

  // Upload growth (group by date, last 7 days)
  const dayMap = new Map<string, number>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    dayMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const row of growthRes.data || []) {
    const d = new Date(row.created_at).toISOString().slice(0, 10)
    if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) || 0) + 1)
  }
  const uploadGrowth = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }))

  const totalUploads = uploadsRes.count || 0
  const maxGrowth = Math.max(...uploadGrowth.map(d => d.count), 1)
  const maxTag = Math.max(...topHashtags.map(t => t.count), 1)

  return (
    <div className="min-h-dvh bg-gray-950 text-white p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📊 Analytics</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { label: 'Tổng bài viết', value: totalUploads },
          { label: 'Lượt xem video', value: totalVideoViews >= 1000 ? (totalVideoViews / 1000).toFixed(1) + 'k' : totalVideoViews },
          { label: 'Avg watch time', value: avgWatchTimeSec + 's' },
          { label: 'Users hoạt động hôm nay', value: dau },
        ].map(k => (
          <div key={k.label} className="bg-gray-900 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">{k.label}</p>
            <p className="text-white font-bold text-2xl">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Upload growth chart */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">Bài đăng mới (7 ngày)</h2>
        <div className="flex items-end gap-2 h-28">
          {uploadGrowth.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-gray-500 text-[9px]">{d.count}</span>
              <div
                className="w-full bg-[#fe2c55] rounded-sm"
                style={{ height: `${Math.max((d.count / maxGrowth) * 80, d.count > 0 ? 4 : 0)}px` }}
              />
              <span className="text-gray-600 text-[9px]">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top hashtags */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">Top hashtags</h2>
        <div className="space-y-2">
          {topHashtags.map(t => (
            <div key={t.tag} className="flex items-center gap-3">
              <span className="text-gray-300 text-sm w-32 truncate">#{t.tag}</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{ width: `${(t.count / maxTag) * 100}%` }}
                />
              </div>
              <span className="text-gray-500 text-xs w-6 text-right">{t.count}</span>
            </div>
          ))}
          {topHashtags.length === 0 && <p className="text-gray-600 text-sm">Chưa có hashtag nào</p>}
        </div>
      </div>
    </div>
  )
}

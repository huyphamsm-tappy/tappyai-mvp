'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { Loader2 } from 'lucide-react'

interface AnalyticsData {
  totalUploads: number
  totalVideoViews: number
  avgWatchTimeSec: number
  topHashtags: { tag: string; count: number }[]
  dailyActiveUsers: number
  uploadGrowth: { date: string; count: number }[]
}

export default function AnalyticsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!isAdmin(user?.id)) { setDenied(true); setLoading(false); return }

      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [uploadsRes, viewsRes, hashtagsRes, dauRes, growthRes] = await Promise.all([
        // Total uploads
        supabase.from('reviews').select('id', { count: 'exact', head: true }).or('is_hidden.is.null,is_hidden.eq.false'),
        // Total video views + avg watch time
        supabase.from('reviews').select('view_count, watch_time_avg').eq('content_type', 'video').or('is_hidden.is.null,is_hidden.eq.false'),
        // Hashtags (flatten and count)
        supabase.from('reviews').select('hashtags').not('hashtags', 'is', null).or('is_hidden.is.null,is_hidden.eq.false').limit(500),
        // Daily active users (from user_events in last 24h)
        supabase.from('user_events').select('user_id', { count: 'exact', head: false }).gte('created_at', since24h),
        // Upload growth last 7 days
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
        for (const tag of row.hashtags || []) freq.set(tag, (freq.get(tag) || 0) + 1)
      }
      const topHashtags = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }))

      // DAU (distinct user_ids last 24h)
      const dauIds = new Set((dauRes.data || []).map((r: any) => r.user_id))
      const dailyActiveUsers = dauIds.size

      // Upload growth (group by date)
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

      setData({
        totalUploads: uploadsRes.count || 0,
        totalVideoViews,
        avgWatchTimeSec,
        topHashtags,
        dailyActiveUsers,
        uploadGrowth,
      })
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return (
    <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
      <Loader2 size={28} className="text-white animate-spin" />
    </div>
  )

  if (denied) return (
    <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
      <p className="text-red-400 font-semibold">Không có quyền truy cập</p>
    </div>
  )

  if (!data) return null

  const maxGrowth = Math.max(...data.uploadGrowth.map(d => d.count), 1)
  const maxTag = Math.max(...data.topHashtags.map(t => t.count), 1)

  return (
    <div className="min-h-dvh bg-gray-950 text-white p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📊 Analytics</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { label: 'Tổng bài viết', value: data.totalUploads },
          { label: 'Lượt xem video', value: data.totalVideoViews >= 1000 ? (data.totalVideoViews / 1000).toFixed(1) + 'k' : data.totalVideoViews },
          { label: 'Avg watch time', value: data.avgWatchTimeSec + 's' },
          { label: 'Users hoạt động hôm nay', value: data.dailyActiveUsers },
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
          {data.uploadGrowth.map(d => (
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
          {data.topHashtags.map(t => (
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
          {data.topHashtags.length === 0 && <p className="text-gray-600 text-sm">Chưa có hashtag nào</p>}
        </div>
      </div>
    </div>
  )
}

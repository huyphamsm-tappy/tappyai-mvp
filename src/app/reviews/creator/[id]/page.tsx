'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Heart, Play, Loader2, UserPlus, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CreatorProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  follower_count: number
  following_count: number
  review_count: number
  is_following: boolean
  is_self: boolean
}

interface Post {
  id: string
  content_type: string | null
  thumbnail: string | null
  photos: string[] | null
  like_count: number
  view_count: number
  place_name: string
}

export default function CreatorPage() {
  const params = useParams()
  const router = useRouter()
  const creatorId = params.id as string
  const supabase = createClient()

  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [totalViews, setTotalViews] = useState(0)
  const [totalWatchMin, setTotalWatchMin] = useState(0)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [profileRes, feedRes] = await Promise.all([
      fetch(`/api/users/${creatorId}`),
      fetch(`/api/reviews/feed?userId=${creatorId}&limit=30&sort=latest`),
    ])
    if (!profileRes.ok) { router.push('/reviews'); return }

    const profileData = await profileRes.json()
    setProfile(profileData)

    if (feedRes.ok) {
      const feedData = await feedRes.json()
      setPosts(feedData.reviews || [])
    }

    // On-the-fly: total views + estimated total watch time from reviews table
    const { data: stats } = await supabase
      .from('reviews')
      .select('view_count, watch_time_avg')
      .eq('user_id', creatorId)
      .or('is_hidden.is.null,is_hidden.eq.false')

    if (stats) {
      const views = stats.reduce((s, r) => s + (r.view_count || 0), 0)
      const watchSec = stats.reduce((s, r) => s + (r.watch_time_avg || 0) * (r.view_count || 0), 0)
      setTotalViews(views)
      setTotalWatchMin(Math.round(watchSec / 60))
    }

    setLoading(false)
  }, [creatorId, router, supabase])

  useEffect(() => { load() }, [load])

  const handleFollow = async () => {
    if (!profile || profile.is_self || followLoading) return
    setFollowLoading(true)
    setProfile(p => p ? { ...p, is_following: !p.is_following, follower_count: p.is_following ? p.follower_count - 1 : p.follower_count + 1 } : p)
    try {
      const res = await fetch(`/api/users/${creatorId}/follow`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) setProfile(p => p ? { ...p, is_following: d.following, follower_count: d.follower_count } : p)
      else setProfile(p => p ? { ...p, is_following: !p.is_following, follower_count: p.is_following ? p.follower_count - 1 : p.follower_count + 1 } : p)
    } finally { setFollowLoading(false) }
  }

  if (loading) return (
    <div className="min-h-dvh bg-black flex items-center justify-center">
      <Loader2 size={28} className="text-white animate-spin" />
    </div>
  )
  if (!profile) return null

  const name = profile.full_name || 'Ẩn danh'
  const handle = '@' + name.replace(/\s+/g, '').toLowerCase()
  const totalLikes = posts.reduce((s, p) => s + (p.like_count || 0), 0)

  return (
    <div className="min-h-dvh bg-black text-white pb-6">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-black/80 backdrop-blur flex items-center gap-3 px-4 pt-12 pb-3">
        <button onClick={() => router.back()}><ArrowLeft size={22} className="text-white" /></button>
        <span className="font-bold text-sm">{handle}</span>
      </div>

      {/* Avatar + stats */}
      <div className="flex flex-col items-center px-4 pt-4 pb-6">
        {profile.avatar_url
          ? <Image src={profile.avatar_url} alt={name} width={88} height={88} className="rounded-full ring-2 ring-white/20 object-cover mb-3" />
          : <div className="w-22 h-22 w-[88px] h-[88px] rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold mb-3">{name[0]?.toUpperCase()}</div>}

        <h1 className="font-bold text-lg mb-0.5">{name}</h1>
        <p className="text-gray-400 text-sm mb-3">{handle}</p>
        {profile.bio && <p className="text-gray-300 text-sm text-center max-w-xs mb-3">{profile.bio}</p>}

        {/* Stats row */}
        <div className="flex gap-7 mb-4">
          {[
            { label: 'Bài viết', value: profile.review_count },
            { label: 'Followers', value: profile.follower_count },
            { label: 'Following', value: profile.following_count },
            { label: 'Likes', value: totalLikes },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="font-bold text-base">{s.value >= 1000 ? (s.value / 1000).toFixed(1) + 'k' : s.value}</span>
              <span className="text-gray-500 text-[10px]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Views + watch time */}
        <div className="flex gap-6 mb-4 text-center">
          <div>
            <p className="font-bold text-sm">{totalViews >= 1000 ? (totalViews / 1000).toFixed(1) + 'k' : totalViews}</p>
            <p className="text-gray-500 text-[10px]">Lượt xem</p>
          </div>
          <div>
            <p className="font-bold text-sm">{totalWatchMin >= 60 ? Math.round(totalWatchMin / 60) + 'g' : totalWatchMin + 'p'}</p>
            <p className="text-gray-500 text-[10px]">Tổng giờ xem</p>
          </div>
        </div>

        {/* Follow / Edit button */}
        {profile.is_self
          ? <Link href="/profile" className="px-10 py-2 rounded-md bg-gray-800 text-white text-sm font-semibold">Chỉnh sửa hồ sơ</Link>
          : <button onClick={handleFollow} disabled={followLoading}
              className={`flex items-center gap-2 px-10 py-2 rounded-md text-sm font-semibold transition-colors ${profile.is_following ? 'bg-gray-800 text-white' : 'bg-[#fe2c55] text-white'}`}>
              {followLoading ? <Loader2 size={14} className="animate-spin" /> : profile.is_following ? <><UserCheck size={14} /> Đang follow</> : <><UserPlus size={14} /> Follow</>}
            </button>}
      </div>

      {/* Posts grid */}
      {posts.length === 0
        ? <p className="text-center text-gray-600 text-sm py-10">Chưa có bài viết</p>
        : <div className="grid grid-cols-3 gap-px bg-gray-900">
            {posts.map(p => {
              const thumb = p.thumbnail || p.photos?.[0]
              const isVideo = p.content_type === 'video'
              return (
                <Link key={p.id} href={`/reviews/${p.id}`} className="relative aspect-[9/16] bg-gray-900 block">
                  {thumb
                    ? <Image src={thumb} alt={p.place_name} fill className="object-cover" sizes="33vw" />
                    : <div className="absolute inset-0 flex items-center justify-center"><span className="text-gray-600 text-xs text-center px-2">{p.place_name}</span></div>}
                  {isVideo && (
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center">
                      <Play size={10} className="text-white fill-white" />
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 flex items-center gap-1">
                    <Heart size={10} className="text-white fill-white" />
                    <span className="text-white text-[10px]">{p.like_count}</span>
                  </div>
                </Link>
              )
            })}
          </div>}
    </div>
  )
}

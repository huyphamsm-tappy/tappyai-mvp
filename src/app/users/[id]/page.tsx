'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ArrowLeft, Star, CheckCircle, MapPin, UserPlus, UserCheck, Loader2 } from 'lucide-react'

interface UserProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  follower_count: number
  following_count: number
  review_count: number
  is_following: boolean
  is_self: boolean
}

interface Review {
  id: string
  place_name: string
  place_address: string | null
  rating: number
  body: string
  photos: string[] | null
  is_verified: boolean
  like_count: number
  comment_count: number
  created_at: string
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={11} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
      ))}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  return `${Math.floor(days / 30)} tháng trước`
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const [profileRes, reviewsRes] = await Promise.all([
        fetch(`/api/users/${userId}`),
        fetch(`/api/reviews/feed?userId=${userId}&limit=20`),
      ])
      if (!profileRes.ok) { router.push('/reviews'); return }
      const profileData = await profileRes.json()
      setProfile(profileData)

      if (reviewsRes.ok) {
        const reviewData = await reviewsRes.json()
        setReviews(reviewData.reviews || [])
      }
    } finally {
      setLoading(false)
    }
  }, [userId, router])

  useEffect(() => { loadProfile() }, [loadProfile])

  const handleFollow = async () => {
    if (!profile || profile.is_self || followLoading) return
    setFollowLoading(true)

    // Optimistic
    setProfile(prev => prev ? {
      ...prev,
      is_following: !prev.is_following,
      follower_count: prev.is_following ? prev.follower_count - 1 : prev.follower_count + 1,
    } : prev)

    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setProfile(prev => prev ? {
          ...prev,
          is_following: data.following,
          follower_count: data.follower_count,
        } : prev)
      } else {
        // Revert
        setProfile(prev => prev ? {
          ...prev,
          is_following: !prev.is_following,
          follower_count: prev.is_following ? prev.follower_count - 1 : prev.follower_count + 1,
        } : prev)
      }
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 size={28} className="text-primary-500 animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  const firstName = profile.full_name?.split(' ').pop() || 'Ẩn danh'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header />

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <ArrowLeft size={22} />
          </button>
          <h1 className="font-bold text-gray-900 dark:text-white">{profile.full_name || 'Người dùng'}</h1>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Profile card */}
        <div className="card p-5">
          <div className="flex items-start gap-4">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={firstName} width={72} height={72} className="rounded-2xl ring-2 ring-primary-100 dark:ring-primary-900 flex-shrink-0" />
            ) : (
              <div className="w-18 h-18 w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-2xl font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg truncate">
                {profile.full_name || 'Ẩn danh'}
              </h2>

              {/* Stats */}
              <div className="flex gap-4 mt-2">
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-white text-base">{profile.review_count}</div>
                  <div className="text-xs text-gray-400">Review</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-white text-base">{profile.follower_count}</div>
                  <div className="text-xs text-gray-400">Followers</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-white text-base">{profile.following_count}</div>
                  <div className="text-xs text-gray-400">Following</div>
                </div>
              </div>
            </div>
          </div>

          {/* Follow button */}
          {!profile.is_self && (
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={`w-full mt-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors
                ${profile.is_following
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
                }
                disabled:opacity-60
              `}
            >
              {followLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : profile.is_following ? (
                <><UserCheck size={16} /> Đang theo dõi</>
              ) : (
                <><UserPlus size={16} /> Theo dõi</>
              )}
            </button>
          )}

          {profile.is_self && (
            <Link
              href="/profile"
              className="block w-full mt-4 py-2.5 rounded-xl font-semibold text-sm text-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              Chỉnh sửa hồ sơ
            </Link>
          )}
        </div>

        {/* Reviews */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3 px-1">
            Đánh giá ({profile.review_count})
          </h3>

          {reviews.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-gray-400 text-sm">Chưa có review nào</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r.id} className="card p-4 space-y-2">
                  {/* Photo strip */}
                  {r.photos && r.photos.length > 0 && (
                    <div className="flex gap-1.5">
                      {r.photos.slice(0, 3).map((url, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                          <Image src={url} alt="" fill className="object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{r.place_name}</h4>
                        {r.is_verified && <CheckCircle size={12} className="text-blue-500 flex-shrink-0" />}
                      </div>
                      {r.place_address && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={10} className="text-gray-400" />
                          <span className="text-xs text-gray-400">{r.place_address}</span>
                        </div>
                      )}
                    </div>
                    <StarRating rating={r.rating} />
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">{r.body}</p>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{timeAgo(r.created_at)}</span>
                    <div className="flex gap-3">
                      <span>❤️ {r.like_count}</span>
                      <span>💬 {r.comment_count ?? 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  )
}

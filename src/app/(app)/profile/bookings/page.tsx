import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BookingsView from './BookingsView'

// Session and data only — see BookingsView for why the presentation is a client component (C15).
export default async function BookingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Email always comes from the session (auth.users.email); profiles.email is
  // being removed (add_profiles_email_isolation.sql).
  const userInfo = {
    full_name: profile?.full_name ?? user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
    email: user.email,
  }

  const todayVN = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // RLS enforces user_id = auth.uid() automatically; explicit eq is belt-and-suspenders
  const [{ data: bookings }, { data: existingReviews }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('reviews')
      .select('place_id')
      .eq('user_id', user.id),
  ])

  return (
    <BookingsView
      userInfo={userInfo}
      bookings={bookings ?? []}
      reviewedPlaceIds={(existingReviews ?? []).map(r => r.place_id).filter(Boolean)}
      todayVN={todayVN}
    />
  )
}

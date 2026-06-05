import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import SignOutButton from './SignOutButton'
import { formatRelativeTime, CATEGORIES } from '@/lib/utils'
import { MessageCircle, ChevronRight, Trash2 } from 'lucide-react'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: conversations } = await supabase.from('conversations').select('id, title, category, updated_at, messages').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50)
  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }
  return (<div className="min-h-dvh bg-gray-50 pb-24"><Header user={userInfo} /><main className="max-w-2xl mx-auto px-4 py-6 space-y-6"><div className="card p-6"><div className="flex items-center gap-4"><div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center"></div><div><h2>{userInfo.full_name}</h2><p>{userInfo.email}</p></div></div></div><div className="card p-2"><SignOutButton /></div></main><BottomNav /></div>)}

import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { serverEnv } from '@/lib/config/env'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

// POST /api/stripe/portal — open the Stripe Customer Portal so a member can manage or
// cancel their subscription themselves (MFS 6.3 Membership: "easy to leave", never coerce).
// Stripe hosts the cancel UI, so there is no custom cancellation logic to maintain.
export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    // stripe_customer_id lives in the restricted billing_customers table (service-role only).
    const admin = createAdminClient()
    const { data: billing } = await admin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!billing?.stripe_customer_id) {
      return NextResponse.json({ error: 'no_subscription', message: serverMessage('subscription.noneToManage', requestLocale(req)) }, { status: 400 })
    }

    const siteUrl = serverEnv.siteUrl() ?? 'https://tappyai.vercel.app'
    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${siteUrl}/subscription`,
    })

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('Stripe portal error:', e)
    return NextResponse.json({ error: 'portal_failed', message: serverMessage('subscription.portalFailed', requestLocale(req)) }, { status: 500 })
  }
}

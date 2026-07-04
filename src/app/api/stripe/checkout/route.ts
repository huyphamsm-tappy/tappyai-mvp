import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // stripe_customer_id lives in the restricted billing_customers table (not the
    // public profiles table), accessed only via the service-role client.
    const admin = createAdminClient()
    const { data: billing } = await admin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Tạo hoặc lấy Stripe customer
    let customerId = billing?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await admin.from('billing_customers').upsert(
        { user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tappyai.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      success_url: `${siteUrl}/subscription?success=1`,
      cancel_url: `${siteUrl}/subscription?canceled=1`,
      payment_method_types: ['card'],
      locale: 'vi',
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('Stripe checkout error:', e)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}

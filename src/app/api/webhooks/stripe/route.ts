import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

// Dùng service role key để ghi DB (bypass RLS)
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (e) {
    console.error('Webhook signature failed:', e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      if (userId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        const { error: upsertErr } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer as string,
          status: sub.status,
          price_id: sub.items.data[0]?.price.id,
          current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
        }, { onConflict: 'user_id' })
        // Return non-2xx so Stripe retries — never report success on a failed write.
        if (upsertErr) {
          console.error('[stripe-webhook] subscription upsert failed:', upsertErr.message)
          return NextResponse.json({ error: 'DB write failed' }, { status: 500 })
        }
      }
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (userId) {
        const { error: upsertErr } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer as string,
          status: sub.status,
          price_id: sub.items.data[0]?.price.id,
          current_period_end: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
        }, { onConflict: 'user_id' })
        if (upsertErr) {
          console.error('[stripe-webhook] subscription upsert failed:', upsertErr.message)
          return NextResponse.json({ error: 'DB write failed' }, { status: 500 })
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

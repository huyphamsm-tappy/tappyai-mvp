// SUBSCRIPTIONS + PAYMENTS — the ONE master switch (P7 web closeout, owner 02/10).
//
// `SUBSCRIPTIONS_ENABLED=1|true` turns on, together: the five paid plans, the SePay/VietQR order + webhook routes, the plan screens, "my plan",
// and the plan-aware AI quota (a paid plan = 30 questions/day). It is one switch on purpose: the plan screens must never promise a quota the
// server does not enforce, and the payment rails must never be on without the screens that explain what is being bought.
// Default OFF in code (read at call time, build env). OFF = the release behaviour exactly (Stripe/Apple routes, legacy Pro exempt).

export function subscriptionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SUBSCRIPTIONS_ENABLED
  return v === '1' || v === 'true'
}

import { NextResponse } from 'next/server'

export const revalidate = 3600 // revalidate tỷ giá mỗi 1 giờ

const SUPPORTED = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'GBP', 'AUD', 'SGD', 'THB', 'CNY', 'HKD', 'TWD']

const FALLBACK_RATES: Record<string, number> = {
  USD: 1, VND: 25400, EUR: 0.92, JPY: 157, KRW: 1380,
  GBP: 0.79, AUD: 1.53, SGD: 1.34, THB: 35.5, CNY: 7.25,
  HKD: 7.82, TWD: 32.2,
}

export async function GET() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
    })
    const data = await res.json()
    if (data.result !== 'success') throw new Error('API error')

    const rates: Record<string, number> = { USD: 1 }
    for (const code of SUPPORTED) {
      if (code !== 'USD' && data.rates[code]) rates[code] = data.rates[code]
    }

    return NextResponse.json({
      rates,
      date: data.time_last_update_utc || null,
      fallback: false,
    })
  } catch {
    return NextResponse.json({ rates: FALLBACK_RATES, date: null, fallback: true })
  }
}

// The Tappy Plan brochure — the public page at /plan/<shareId>, its social
// image, and the mini preview inside the share menu.
//
// One table for all three surfaces, keyed by locale, so the page a recipient
// opens says the same thing as the preview the sender saw. `{n}` is the only
// substitution. Strings that name real plan fields only: nothing here labels a
// date, a night count or a destination, because the plan has no such fields.

import type { RequestLocale } from './requestLocale'

export interface PlanBrochureStrings {
  eyebrow: string
  itinerary: string
  itineraryLead: string
  overview: string
  highlights: string
  days: string
  stops: string
  people: string
  budget: string
  budgetPerPerson: string
  maps: string
  booking: string
  day: string
  dayN: string
  cta: string
  madeBy: string
  madeByLine: string
  share: string
  notFoundTitle: string
  notFoundBody: string
  notFoundCta: string
  ogDescription: string
  linkPending: string
  linkSignIn: string
  linkFailed: string
  linkRetry: string
  linkRequired: string
}

const STRINGS: Record<RequestLocale, PlanBrochureStrings> = {
  vi: {
    eyebrow: 'Tappy Plan',
    itinerary: 'Hành trình',
    itineraryLead: 'Từng chặng của chuyến đi, theo đúng thứ tự.',
    overview: 'Tổng quan chuyến đi',
    highlights: 'Điểm nổi bật',
    days: '{n} ngày',
    stops: '{n} điểm dừng',
    people: '{n} người',
    budget: 'Ngân sách ước tính',
    budgetPerPerson: 'Ngân sách',
    maps: 'Bản đồ',
    booking: 'Đặt chỗ',
    day: 'Ngày',
    dayN: 'Ngày {n}',
    cta: 'Xem kế hoạch đầy đủ trên Tappy',
    madeBy: 'Được tạo bởi',
    madeByLine: 'Một chuyến đi, theo cách của bạn.',
    share: 'Chia sẻ',
    notFoundTitle: 'Không tìm thấy kế hoạch này',
    notFoundBody: 'Liên kết có thể đã sai hoặc kế hoạch đã được gỡ.',
    notFoundCta: 'Về TappyAI',
    ogDescription: '{n} ngày · Kế hoạch từ TappyAI',
    linkPending: 'Đang tạo liên kết kế hoạch…',
    linkSignIn: 'Đăng nhập để tạo liên kết kế hoạch — hiện tại chia sẻ bằng văn bản',
    linkFailed: 'Chưa tạo được liên kết kế hoạch — hiện tại chia sẻ bằng văn bản',
    linkRetry: 'Thử lại',
    linkRequired: 'Cần có liên kết kế hoạch để chia sẻ lên đây',
  },
  en: {
    eyebrow: 'Tappy Plan',
    itinerary: 'Itinerary',
    itineraryLead: 'Every stop of the trip, in order.',
    overview: 'Trip overview',
    highlights: 'Highlights',
    days: '{n} days',
    stops: '{n} stops',
    people: '{n} people',
    budget: 'Estimated budget',
    budgetPerPerson: 'Budget',
    maps: 'Maps',
    booking: 'Book',
    day: 'Day',
    dayN: 'Day {n}',
    cta: 'See the full plan on Tappy',
    madeBy: 'Created by',
    madeByLine: 'One trip, your way.',
    share: 'Share',
    notFoundTitle: 'This plan could not be found',
    notFoundBody: 'The link may be wrong, or the plan has been taken down.',
    notFoundCta: 'Go to TappyAI',
    ogDescription: '{n} days · A plan from TappyAI',
    linkPending: 'Creating the plan link…',
    linkSignIn: 'Sign in to create a plan link — sharing as text for now',
    linkFailed: 'The plan link could not be created — sharing as text for now',
    linkRetry: 'Retry',
    linkRequired: 'This needs the plan link',
  },
}

export function planBrochureStrings(locale: RequestLocale): PlanBrochureStrings {
  return STRINGS[locale] ?? STRINGS.vi
}

export function fill(template: string, n: number | string): string {
  return template.replace('{n}', String(n))
}

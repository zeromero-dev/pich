import type { Locale } from '@/lib/i18n'

/** Currency: ₴ with space-separated thousands, e.g. "₴1 200". */
export function formatPrice(amount: number): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')
  return `₴${grouped}`
}

const UK_MONTHS = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
]

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "21 листопада 2026" · "21–22 листопада 2026" · "30 листопада – 2 грудня 2026".
 * Splits the strings rather than new Date(), which would shift dates on a UTC server.
 */
type EventWhen = { date: string; endDate?: string; time?: string; endTime?: string }

/** «21 листопада 2026», plus «, 18:00» or «, 18:00–20:00» when the event has a time. */
export function formatEventDate(event: EventWhen, locale: Locale): string {
  const clock = event.time ? `, ${event.time}${event.endTime ? `–${event.endTime}` : ''}` : ''
  return formatEventDays(event, locale) + clock
}

function formatEventDays(event: EventWhen, locale: Locale): string {
  const months = locale === 'uk' ? UK_MONTHS : EN_MONTHS
  const [y1, m1, d1] = event.date.split('-').map(Number)
  if (!event.endDate) return `${d1} ${months[m1 - 1]} ${y1}`
  const [y2, m2, d2] = event.endDate.split('-').map(Number)
  if (y1 !== y2) return `${d1} ${months[m1 - 1]} ${y1} – ${d2} ${months[m2 - 1]} ${y2}`
  if (m1 !== m2) return `${d1} ${months[m1 - 1]} – ${d2} ${months[m2 - 1]} ${y2}`
  return `${d1}–${d2} ${months[m1 - 1]} ${y1}`
}

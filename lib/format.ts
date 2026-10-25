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
export function formatEventDate(event: { date: string; endDate?: string }, locale: Locale): string {
  const months = locale === 'uk' ? UK_MONTHS : EN_MONTHS
  const [y1, m1, d1] = event.date.split('-').map(Number)
  if (!event.endDate) return `${d1} ${months[m1 - 1]} ${y1}`
  const [y2, m2, d2] = event.endDate.split('-').map(Number)
  if (y1 !== y2) return `${d1} ${months[m1 - 1]} ${y1} – ${d2} ${months[m2 - 1]} ${y2}`
  if (m1 !== m2) return `${d1} ${months[m1 - 1]} – ${d2} ${months[m2 - 1]} ${y2}`
  return `${d1}–${d2} ${months[m1 - 1]} ${y1}`
}

const UK_MONTHS_NOMINATIVE = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
]

const EN_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** "14 серпня, 18:00" for uk; "14 Aug, 18:00" for en. */
export function formatEventDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso)
  const day = d.getDate()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (locale === 'uk') {
    return `${day} ${UK_MONTHS[d.getMonth()]}, ${time}`
  }
  return `${day} ${EN_MONTHS_SHORT[d.getMonth()]}, ${time}`
}

/** Calendar-leaf date block: { day: "14", month: "СЕР" }. */
export function eventDateParts(iso: string, locale: Locale) {
  const d = new Date(iso)
  const day = String(d.getDate())
  const month =
    locale === 'uk'
      ? UK_MONTHS[d.getMonth()].slice(0, 3).toUpperCase()
      : EN_MONTHS_SHORT[d.getMonth()].toUpperCase()
  return { day, month }
}

/** Month grouping label, e.g. "Серпень" / "August". */
export function monthLabel(iso: string, locale: Locale): string {
  const d = new Date(iso)
  if (locale === 'uk') return UK_MONTHS_NOMINATIVE[d.getMonth()]
  return new Date(iso).toLocaleDateString('en', { month: 'long' })
}

export function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}`
}

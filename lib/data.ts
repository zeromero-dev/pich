/**
 * Domain types + mock events. Works and artists come from the CRM via
 * `lib/hugeprofit/`; events will come from Google Calendar. Content is
 * single-language (as the CRM provides it), per the i18n note — we don't
 * promise a translated catalog.
 */

export type Category = {
  /** CRM category id as a string — stable, unlike the Ukrainian label. */
  slug: string
  label: string
}

/** A category as shown in the shop filter bar. */
export type CategoryFilter = Category & {
  /** Works in this category *including its descendants* — see catalog.md. */
  count: number
}

/**
 * A work in the shop. No `medium`/`year` — the CRM has no source for them
 * (`attr[]` is filled on 2 of 258 products).
 */
export type Product = {
  id: string
  slug: string
  name: string
  /** `null` when the CRM brand is unset — 22 of the 252 live works today. */
  artist: string | null
  /** CRM brand id — the stable half of the Artists join. */
  artistId: string | null
  artistSlug: string | null
  price: number
  /**
   * Leaf category first, then its ancestors. Filtering matches anywhere in
   * this chain, so picking a parent finds works filed under its children.
   */
  categories: Category[]
  inStock: boolean
  /** Exactly one left. Drives the "остання" marker; availability stays boolean. */
  isLast: boolean
  images: string[]
  /**
   * CRM description, rendered verbatim. Decided 2026-08-12: the owners clean
   * the field in the CRM — see catalog.md rule 3 for what is in there today.
   */
  description: string | null
  /** Decoded from the CRM `size` field, e.g. "30 × 21 см". */
  size: string | null
  /** CRM article. Not displayed — it is an internal code — but orders need it. */
  sku: string | null
}

export type PlaiEvent = {
  id: string
  title: string
  start: string // ISO
  location: string
  description: string
}

/**
 * An artist, derived from the CRM brand on their works. Bios and portraits are
 * repo content (content-as-code) keyed by slug — see `artistProfiles`.
 */
export type Artist = {
  /** CRM brand id. */
  id: string
  slug: string
  name: string
  workCount: number
  /** First image of one of their works, used as the roster thumbnail. */
  cover: string | null
  portrait?: string
  bio?: string
}

/**
 * Hand-written artist content, keyed by artist slug. Empty until the owners
 * decide who gets a bio — an artist with no entry still gets a roster card and
 * a page listing their works.
 */
export const artistProfiles: Record<string, { portrait?: string; bio: string }> = {}

/** Upcoming events, sorted by start date. Stand-in for Google Calendar. */
function daysFromNow(days: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const events: PlaiEvent[] = [
  {
    id: 'e1',
    title: 'Відкриття виставки «Нічний приплив»',
    start: daysFromNow(4, 18),
    location: 'Плай Піч, головна зала',
    description:
      'Урочисте відкриття персональної виставки Оксани Мельник. Знайомство з мисткинею, келих вина та перший погляд на нову серію робіт.',
  },
  {
    id: 'e2',
    title: 'Майстер-клас з акварелі',
    start: daysFromNow(9, 15),
    location: 'Плай Піч, студія',
    description:
      'Дводенний майстер-клас для початківців. Усі матеріали надаємо. Кількість місць обмежена.',
  },
  {
    id: 'e3',
    title: 'Артист-ток: сучасний український пейзаж',
    start: daysFromNow(16, 19),
    location: 'Плай Піч, лекторій',
    description:
      'Розмова з Андрієм Ковальчуком про традицію і сучасність у пейзажному живописі. Вхід вільний.',
  },
  {
    id: 'e4',
    title: 'Недільний живопис для всіх',
    start: daysFromNow(20, 12),
    location: 'Плай Піч, студія',
    description:
      'Розслаблена сесія живопису у неділю. Приходьте з друзями, кава та полотно — за нами.',
  },
  {
    id: 'e5',
    title: 'Вечір графіки та друку',
    start: daysFromNow(34, 18, 30),
    location: 'Плай Піч, майстерня',
    description:
      'Демонстрація технік лінодруку й офорту. Спробуйте зробити власний відбиток разом із митцями.',
  },
]

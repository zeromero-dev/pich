import 'server-only'

import { parseCsv } from '@/lib/csv'
import { slugBase } from '@/lib/slug'

/**
 * Store events, kept by the owners in a Google Sheet published as CSV — not a
 * calendar (client brief). Events never expire: past ones stay as news.
 */
export type PlaiEvent = {
  /** Permanent URL identity: /events/<slug>. */
  slug: string
  title: string
  /** Day (or first day), 'YYYY-MM-DD'. */
  date: string
  /** Last day of a multi-day event, same format; absent for one-day events. */
  endDate?: string
  summary: string
  image?: string
}

/** Google re-publishes a sheet about every 5 minutes; matching it costs nothing. */
const EVENTS_REVALIDATE = 300

const HEADERS = {
  title: 'назва',
  date: 'дата',
  endDate: 'дата завершення',
  summary: 'короткий опис',
  image: 'фото',
  slug: 'slug',
} as const

type Column = keyof typeof HEADERS

/** 'YYYY-MM-DD' or 'DD.MM.YYYY' → 'YYYY-MM-DD'; null for anything else or an impossible date. */
function toIsoDate(raw: string): string | null {
  const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw)
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : raw
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const check = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso
}

/* Drive "share" links are HTML pages, not images. The lh3 form serves the file
   itself for files shared "anyone with the link" — unofficial and unverified. */
function toImage(raw: string): string | undefined {
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/.exec(raw)
  if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}`
  return raw.startsWith('https://') || raw.startsWith('/') ? raw : undefined
}

export function toEvents(rows: string[][]): PlaiEvent[] {
  const [header, ...records] = rows
  if (!header) return []
  const names = header.map((h) => h.trim().toLowerCase())
  const index = Object.fromEntries(
    (Object.keys(HEADERS) as Column[]).map((key) => [key, names.indexOf(HEADERS[key])]),
  ) as Record<Column, number>

  const events: PlaiEvent[] = []
  const seen = new Set<string>()

  records.forEach((cells, i) => {
    const get = (key: Column) => (index[key] >= 0 ? (cells[index[key]] ?? '').trim() : '')
    if (cells.every((c) => !c.trim())) return // blank row

    const where = `[events] sheet row ${i + 2}`
    const title = get('title')
    const summary = get('summary')
    const date = toIsoDate(get('date'))
    if (!title || !summary || !date) {
      console.warn(`${where} skipped: Назва, Дата (2026-11-21 or 21.11.2026) and Короткий опис are required`)
      return
    }

    const endRaw = get('endDate')
    const endDate = endRaw ? toIsoDate(endRaw) : undefined
    if (endDate === null || (endDate && endDate < date)) {
      console.warn(`${where} skipped: Дата завершення is not a date on or after Дата`)
      return
    }

    const slug = slugBase(get('slug') || `${title} ${date}`)
    if (!slug || seen.has(slug)) {
      console.warn(`${where} skipped: slug "${slug}" is empty or already used by another row`)
      return
    }
    seen.add(slug)

    const image = toImage(get('image'))
    events.push({
      slug,
      title,
      date,
      ...(endDate && endDate !== date ? { endDate } : {}),
      summary,
      ...(image ? { image } : {}),
    })
  })

  return events
}

/* A "Share" / edit link serves the editor HTML. Its export URL serves the same tab
   (the first one without a gid) as CSV to anyone with view access.
   "Publish to web" links (/d/e/…) and other URLs pass through unchanged. */
export function toCsvUrl(url: string): string {
  const id = /docs\.google\.com\/spreadsheets\/d\/(?!e\/)([\w-]+)/.exec(url)
  if (!id) return url
  const gid = /[?#&]gid=(\d+)/.exec(url)
  return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid[1]}` : ''}`
}

export async function getEvents(): Promise<PlaiEvent[]> {
  const url = process.env.EVENTS_SHEET_CSV_URL
  if (!url) {
    console.warn('[events] EVENTS_SHEET_CSV_URL is not set — showing no events')
    return []
  }
  // Throws on a bad response on purpose: during ISR Next keeps the last good page.
  const res = await fetch(toCsvUrl(url), { cache: 'force-cache', next: { revalidate: EVENTS_REVALIDATE } })
  if (!res.ok) throw new Error(`[events] sheet responded ${res.status}`)
  // A sheet that isn't shared answers 200 with Google's sign-in page.
  if (res.headers.get('content-type')?.includes('text/html')) {
    throw new Error('[events] got HTML, not CSV — share the sheet "Anyone with the link: Viewer"')
  }
  return toEvents(parseCsv(await res.text()))
}

export async function getEvent(slug: string): Promise<PlaiEvent | undefined> {
  return (await getEvents()).find((e) => e.slug === slug)
}

const kyivDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export type EventPhase = 'current' | 'upcoming' | 'past'

/** Current from its first through its last day, past from the day after; Kyiv time. ISO dates compare as strings. */
export function eventPhase(event: PlaiEvent, now = new Date()): EventPhase {
  const today = kyivDay.format(now)
  if ((event.endDate ?? event.date) < today) return 'past'
  return event.date <= today ? 'current' : 'upcoming'
}

/** Brief: «Першою є завжди найновіша подія або найближча» — soonest first, then latest past. */
export function splitEvents(list: PlaiEvent[], now = new Date()) {
  const of = (phase: EventPhase) => list.filter((e) => eventPhase(e, now) === phase)
  const soonest = (a: PlaiEvent, b: PlaiEvent) => a.date.localeCompare(b.date)
  return {
    current: of('current').sort(soonest),
    upcoming: of('upcoming').sort(soonest),
    past: of('past').sort((a, b) => (b.endDate ?? b.date).localeCompare(a.endDate ?? a.date)),
  }
}

export type EventBadge = 'current' | 'soon' | 'past'

/** «Незабаром» goes only to the nearest upcoming date (every event on it); later ones get no badge. */
export function eventBadge(event: PlaiEvent, nearestUpcoming: string | undefined, now = new Date()): EventBadge | undefined {
  const phase = eventPhase(event, now)
  if (phase !== 'upcoming') return phase
  return event.date === nearestUpcoming ? 'soon' : undefined
}

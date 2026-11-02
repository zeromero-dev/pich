import 'server-only'

import { NOTION_EVENTS, type NotionPage, photoOf, queryNotionPages, text, uniqueId } from '@/lib/notion'

/**
 * Store events, kept by the owners in the Notion «Події» database — not a
 * calendar (client brief). Events never expire: past ones stay as news.
 */
export type PlaiEvent = {
  /** Permanent URL identity, /events/<slug>: the row's Notion «ID» number, so a retitled event keeps its address. */
  slug: string
  title: string
  /** Day (or first day), 'YYYY-MM-DD'. */
  date: string
  /** Last day of a multi-day event, same format; absent for one-day events. */
  endDate?: string
  /** 'HH:MM' as typed in Notion (the center's local time); absent for all-day events. */
  time?: string
  /** 'HH:MM', only when the event ends on the day it starts. */
  endTime?: string
  summary: string
  /** English text for the EN locale; the Ukrainian is shown when absent. */
  titleEn?: string
  summaryEn?: string
  image?: string
}

const HEADERS = {
  title: 'назва',
  date: 'дата',
  endDate: 'дата завершення',
  summary: 'короткий опис',
  image: 'фото',
  id: 'id',
  time: 'час',
  endTime: 'час завершення',
  titleEn: 'назва (en)',
  summaryEn: 'опис (en)',
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

/** Rows → events. Each skipped row adds a manager-readable reason to `problems`. */
export function toEvents(rows: string[][], problems: string[] = []): PlaiEvent[] {
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

    const skip = (why: string) => {
      const line = `Подія «${get('title') || `рядок ${i + 1}`}» не показана: ${why}`
      console.warn(`[events] ${line}`)
      problems.push(line)
    }
    const title = get('title')
    const summary = get('summary')
    const date = toIsoDate(get('date'))
    if (!title || !summary || !date) {
      skip('потрібні Назва, Дата і Опис.')
      return
    }

    const endRaw = get('endDate')
    const endDate = endRaw ? toIsoDate(endRaw) : undefined
    if (endDate === null || (endDate && endDate < date)) {
      skip('дата завершення раніша за дату початку.')
      return
    }

    const slug = get('id')
    if (!slug || seen.has(slug)) {
      skip('у рядка немає ID — додайте подію заново.')
      return
    }
    seen.add(slug)

    const image = toImage(get('image'))
    const clock = (raw: string) => (/^\d{2}:\d{2}$/.test(raw) ? raw : undefined)
    const time = clock(get('time'))
    const endTime = time && (!endDate || endDate === date) ? clock(get('endTime')) : undefined
    const titleEn = get('titleEn')
    const summaryEn = get('summaryEn')
    events.push({
      slug,
      title,
      date,
      ...(endDate && endDate !== date ? { endDate } : {}),
      ...(time ? { time } : {}),
      ...(endTime && endTime !== time ? { endTime } : {}),
      summary,
      ...(titleEn ? { titleEn } : {}),
      ...(summaryEn ? { summaryEn } : {}),
      ...(image ? { image } : {}),
    })
  })

  return events
}

/** An event row with «Показати» unticked is a draft: kept in Notion, not on the site. */
export const isDraft = (page: NotionPage) => page.properties['Показати']?.checkbox !== true

/* Published Notion rows → the sheet's row shape, so toEvents keeps every validation rule.
   A Notion date-time ('2026-11-21T18:00:00.000+02:00') splits into its day and its
   local clock time, which is what the manager typed. */
export function notionRows(pages: NotionPage[]): string[][] {
  const day = (v: string | null | undefined) => (v ?? '').slice(0, 10)
  const clock = (v: string | null | undefined) => (v ?? '').slice(11, 16)
  return [
    [
      HEADERS.title, HEADERS.date, HEADERS.endDate, HEADERS.summary, HEADERS.image, HEADERS.id,
      HEADERS.time, HEADERS.endTime, HEADERS.titleEn, HEADERS.summaryEn,
    ],
    ...pages
      .filter((p) => !isDraft(p))
      .map((page) => {
        const r = page.properties
        return [
          text(r['Назва']),
          day(r['Дата']?.date?.start),
          day(r['Дата']?.date?.end),
          text(r['Опис']),
          photoOf(page),
          uniqueId(r['ID']),
          clock(r['Дата']?.date?.start),
          clock(r['Дата']?.date?.end),
          text(r['Назва (EN)']),
          text(r['Опис (EN)']),
        ]
      }),
  ]
}

export async function getEvents(): Promise<PlaiEvent[]> {
  const pages = await queryNotionPages(NOTION_EVENTS)
  return pages ? toEvents(notionRows(pages)) : []
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

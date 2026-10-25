# Store Events, Detached from the Calendar: Implementation Plan (P4)

> Work through the tasks in order. Each task ends with a verify step and a commit. Tick `- [ ]` → `- [x]` as you go.

**Goal:** Implement the brief's «Сторінка подій» exactly:
- Events are detached from the calendar, and the store publishes its own.
- The page is split into «Майбутні події» / «Минулі події».
- With no upcoming events, only past ones show, with no empty block.
- Cards show the event date and a clear status.
- Each event page shows the title, date and short description.
- Events don't disappear: they stay up like news.
- Nearest upcoming events come first, then the most recent past ones.

**Architecture:** The owners keep events in a Google Sheet (user decision D2) and publish it as CSV ("Publish to web"). The server fetches it with `cache: 'force-cache'` + `next.revalidate: 300` and parses it with a small RFC 4180 parser (`lib/csv.ts`, no dependency). `lib/events.ts` maps rows to `PlaiEvent`. A bad row is skipped with a `console.warn` naming its sheet row, so one typo never takes the page down. Upcoming/past is decided on the server in Kyiv time, and pages regenerate every 5 minutes. Dates stay `YYYY-MM-DD` strings and are formatted by splitting them, never through `new Date()`, which avoids the UTC-server date shift the current `formatEventDateTime` has.

**Tech Stack:** Next.js 16 App Router (`fetch` cache options, `generateStaticParams`, `revalidate`, async `params`), React 19, Tailwind 4, lucide-react. No new dependencies.

**Spec (verbatim, `task/TASK_UK.md` «Сторінка подій»):**

> Відв’язати їх від календаря ( ми публікуватимемо тут події по’язані з крамничкою)
>
> Я б розділила сторінку на «Майбутні події» та «Минулі події». Якщо майбутніх немає, показуємо лише минулі, без порожнього блоку. На картках — дата проведення та зрозумілий статус, щоб старе запрошення не сприймали як актуальне.
>
> сторінка з подією має містити назву і дату і короткий опис. події не зникають а залишається як новини. Першою є завжди найновіша подія або найближча (якщо це можливо)

English: `task/TASK.md` §6. Reference layout: `task/assets/image10.webp` (photo left; title, date, text, button right). Decisions: overview D2, A8.

## Requirement → implementation

| Brief | Where |
|---|---|
| Detach from the calendar, store events published here | Mocks and all calendar code removed (Task 2). Source = the owners' sheet (Task 1). Homepage block is already static (P3) |
| «Майбутні події» / «Минулі події» | `EventsView` sections (Task 2) |
| No upcoming events → only past, no empty block | `upcoming.length > 0 &&` (Task 2) |
| Card: event date + clear status | `formatEventDate` + `EventStatus` «Незабаром» / «Відбулася», with past photos in greyscale (Task 2) |
| Event page: title, date, short description | `/events/[slug]` (Task 3) |
| Events don't disappear, stay as news | No date cut-off anywhere. Pages stay reachable for as long as the row exists (Tasks 1, 3) |
| First = nearest or most recent | `splitEvents`: upcoming soonest-first, then past newest-first (Task 1) |

**Deliberately not built** (not in the brief): start time, location, long description, registration, drafts. Each is one more sheet column plus one line in `toEvents` if the owners ask later.

## Global Constraints

- **Runs with or without P3.** First check: `test -f components/landing/events-preview.tsx && echo present`. If `present` (P3 not shipped), add this to Task 2 Step 5: `git rm components/landing/events-preview.tsx`, then in `app/page.tsx` delete its import and the `<EventsPreview />` line. That's the homepage's only use of the mock events. P3 later replaces that spot with the static events block.
- **No invented events** (brief §0.6). The five mocks in `lib/data.ts` are deleted. Test rows live only in an uncommitted fixture (Task 4).
- **Server-only fetch:** `lib/events.ts` imports `server-only`. Client components import only `type PlaiEvent`, which is erased at build.
- `EVENTS_SHEET_CSV_URL` is server-only config (no `NEXT_PUBLIC_`). Unset → no events, one warning, never a throw (a missing sheet must not break the shop build). A non-200 from Google **throws**: during ISR, Next keeps serving the last good page.
- Status rule (default A8): an event is past from the day after its last day, `Europe/Kyiv`. «Майбутні події» / «Минулі події» are verbatim from the brief. «Незабаром» / «Відбулася» are our labels for the brief's "зрозумілий статус".
- Comments: 2–3 lines max, constraints only.
- Verify every task with: `npx react-doctor@latest` → `npm run lint` → `npm run build`.

## The sheet (owners fill it, code reads it)

Row 1 holds the headers below (case-insensitive, trimmed, any column order). One row = one event.

| Header | Required | Format | Notes |
|---|---|---|---|
| `Назва` | yes | text | |
| `Дата` | yes | `2026-11-21` or `21.11.2026` | the day of the event, or its first day |
| `Дата завершення` | no | same | only for multi-day events (fairs, exhibitions), so the status stays «Незабаром» until the last day |
| `Короткий опис` | yes | text | card and event page |
| `Фото` | no | Google Drive share link, any `https://` image URL, or `/images/...` | Drive links are rewritten to a direct-image URL |
| `Slug` | no | Latin, e.g. `zymovyi-yarmarok-2026` | permanent URL. If empty: derived from title + date (then editing the title changes the URL) |

---

### Task 1: Pure modules: slug, CSV, event model and rules

Nothing is wired to pages yet, so the build stays green.

**Files:**
- Create: `lib/slug.ts` (transliteration moved out of `lib/hugeprofit/map.ts`)
- Modify: `lib/hugeprofit/map.ts` (import from `lib/slug.ts`)
- Create: `lib/csv.ts`
- Create: `lib/events.ts`
- Modify: `lib/format.ts` (add `formatEventDate`. Removals happen in Task 2)

**Interfaces:**
- Produces: `slugBase(input: string): string` from `lib/slug.ts`. `parseCsv(text: string): string[][]` from `lib/csv.ts`. From `lib/events.ts`: `PlaiEvent`, `toEvents(rows: string[][]): PlaiEvent[]`, `getEvents(): Promise<PlaiEvent[]>`, `getEvent(slug: string): Promise<PlaiEvent | undefined>`, `isPast(event: PlaiEvent, now?: Date): boolean`, `splitEvents(list: PlaiEvent[], now?: Date): { upcoming: PlaiEvent[]; past: PlaiEvent[] }`. From `lib/format.ts`: `formatEventDate(event: { date: string; endDate?: string }, locale: Locale): string`.

- [ ] **Step 1: Snapshot URLs before touching slugs.** `npm run dev`, then `curl -s localhost:3000/sitemap.xml > "$TMPDIR/sitemap-before.xml"` (any temp path outside the repo).

- [ ] **Step 2: Create `lib/slug.ts`.** Move `TRANSLIT`, `transliterate` and `slugBase` out of `lib/hugeprofit/map.ts` unchanged, exporting `slugBase`:

```ts
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'y', э: 'e',
  ё: 'e', '’': '', "'": '', ʼ: '',
}

function transliterate(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
}

/** Latin kebab-case. URLs built from it are permanent — don't change the table. */
export function slugBase(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

In `lib/hugeprofit/map.ts`, delete those three definitions and add `import { slugBase } from '@/lib/slug'`. `toSlug`, `toArtistSlug` and `idFromSlug` stay in `map.ts` unchanged.

- [ ] **Step 3: Prove product/artist URLs did not move.** `curl -s localhost:3000/sitemap.xml | diff "$TMPDIR/sitemap-before.xml" - && echo same`. Expected: `same`.

- [ ] **Step 4: Create `lib/csv.ts`**

```ts
/**
 * RFC 4180, as Google Sheets exports it: quoted fields may contain commas,
 * doubled quotes ("") and line breaks. \r is dropped everywhere.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\r') continue
    if (quoted) {
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
```

- [ ] **Step 5: Create `lib/events.ts`**

```ts
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
   itself for files shared "anyone with the link" — unofficial; Task 4 checks it. */
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

export async function getEvents(): Promise<PlaiEvent[]> {
  const url = process.env.EVENTS_SHEET_CSV_URL
  if (!url) {
    console.warn('[events] EVENTS_SHEET_CSV_URL is not set — showing no events')
    return []
  }
  // Throws on a bad response on purpose: during ISR Next keeps the last good page.
  const res = await fetch(url, { cache: 'force-cache', next: { revalidate: EVENTS_REVALIDATE } })
  if (!res.ok) throw new Error(`[events] sheet responded ${res.status}`)
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

/** Past from the day after its last day, Kyiv time. ISO dates compare as strings. */
export function isPast(event: PlaiEvent, now = new Date()): boolean {
  return (event.endDate ?? event.date) < kyivDay.format(now)
}

/** Brief: «Першою є завжди найновіша подія або найближча» — nearest upcoming, then latest past. */
export function splitEvents(list: PlaiEvent[], now = new Date()) {
  const upcoming = list.filter((e) => !isPast(e, now)).sort((a, b) => a.date.localeCompare(b.date))
  const past = list
    .filter((e) => isPast(e, now))
    .sort((a, b) => (b.endDate ?? b.date).localeCompare(a.endDate ?? a.date))
  return { upcoming, past }
}
```

- [ ] **Step 6: Add `formatEventDate` to `lib/format.ts`** (below `UK_MONTHS`. Old helpers are removed in Task 2):

```ts
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
```

- [ ] **Step 7: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add lib/slug.ts lib/hugeprofit/map.ts lib/csv.ts lib/events.ts lib/format.ts
git commit -m "feat(events): store events from the owners' sheet, shared slug helper"
```

---

### Task 2: Listing: upcoming/past, cards, mocks and calendar code removed

**Files:**
- Modify: `components/event-card.tsx` (full rewrite; removes `googleCalendarUrl` and the «Записатись» button)
- Modify: `components/events/events-view.tsx` (full rewrite)
- Modify: `app/events/page.tsx` (full rewrite)
- Modify: `lib/data.ts` (delete `PlaiEvent`, `daysFromNow`, `events`. Fix the header comment)
- Modify: `lib/format.ts` (delete `UK_MONTHS_NOMINATIVE`, `EN_MONTHS_SHORT`, `formatEventDateTime`, `eventDateParts`, `monthLabel`, `monthKey`)
- Modify: `lib/i18n.ts` (`events.*`, both locales)

**Interfaces:**
- Consumes: `getEvents`, `splitEvents`, `PlaiEvent`, `formatEventDate` (Task 1).
- Produces: `EventStatus({ past: boolean })`, `EventCard({ event: PlaiEvent; past: boolean })`, `EventsView({ upcoming: PlaiEvent[]; past: PlaiEvent[] })`.

- [ ] **Step 1: i18n.** Replace the `events` block in both locales:

```ts
    // uk
    events: {
      title: 'Події',
      lead: 'Тут розповідаємо, де й коли можна зустрітися з нами, та ділимося тим, що вже відбулося.',
      upcoming: 'Майбутні події',
      past: 'Минулі події',
      statusUpcoming: 'Незабаром',
      statusPast: 'Відбулася',
      more: 'Детальніше',
      back: 'До подій',
      empty: 'Незабаром тут зʼявляться наші події.',
    },
```

```ts
    // en
    events: {
      title: 'Events',
      lead: 'Here we share where and when you can meet us, along with stories from events that have already taken place.',
      upcoming: 'Upcoming events',
      past: 'Past events',
      statusUpcoming: 'Upcoming',
      statusPast: 'Took place',
      more: 'Details',
      back: 'Back to events',
      empty: 'Our events will appear here soon.',
    },
```

(`lead` is the brief's second «Події» paragraph, verbatim. `upcoming`/`past` are verbatim. `statusUpcoming`, `statusPast`, `more`, `back` and `empty` are our UI labels: list them in the PR for owner review. `register`, `addToCalendar` and `location` go away with the calendar button.)

- [ ] **Step 2: Rewrite `components/event-card.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { formatEventDate } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { cn } from '@/lib/utils'
import type { PlaiEvent } from '@/lib/events'

export function EventStatus({ past }: { past: boolean }) {
  const { t } = useLocale()
  return (
    <span
      className={cn(
        'inline-flex self-start rounded-full px-2.5 py-1 text-[11px] font-medium',
        past ? 'bg-surface-alt text-ink-soft' : 'bg-ink text-surface',
      )}
    >
      {past ? t.events.statusPast : t.events.statusUpcoming}
    </span>
  )
}

/* The title link stretches over the whole card (::after): one Tab stop per event. */
export function EventCard({ event, past }: { event: PlaiEvent; past: boolean }) {
  const { t, locale } = useLocale()

  return (
    <article className="relative grid gap-5 rounded-2xl border border-hairline bg-surface p-4 transition-shadow focus-within:ring-2 focus-within:ring-ink hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:p-5">
      {event.image && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-alt">
          <img
            src={event.image}
            alt=""
            loading="lazy"
            className={cn('absolute inset-0 h-full w-full object-cover', past && 'grayscale')}
          />
        </div>
      )}
      <div className={cn('flex min-w-0 flex-col', !event.image && 'sm:col-span-2')}>
        <EventStatus past={past} />
        <h3 className="mt-3 text-lg font-semibold leading-snug text-ink text-pretty md:text-xl">
          <Link
            href={`/events/${event.slug}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {event.title}
          </Link>
        </h3>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-soft">
          <CalendarDays className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {formatEventDate(event, locale)}
        </p>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft text-pretty">
          {event.summary}
        </p>
        <span aria-hidden="true" className="mt-auto pt-4 text-sm font-medium text-ink">
          {t.events.more} →
        </span>
      </div>
    </article>
  )
}
```

- [ ] **Step 3: Rewrite `components/events/events-view.tsx`**

```tsx
'use client'

import type { PlaiEvent } from '@/lib/events'
import { useLocale } from '@/components/providers'
import { EventCard } from '@/components/event-card'
import { Reveal, StaggerGroup, StaggerItem } from '@/components/reveal'

function EventList({ title, events, past }: { title: string; events: PlaiEvent[]; past: boolean }) {
  return (
    <section>
      <Reveal className="mb-5">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      </Reveal>
      <StaggerGroup className="flex flex-col gap-4">
        {events.map((event) => (
          <StaggerItem key={event.slug}>
            <EventCard event={event} past={past} />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  )
}

/* Brief: «Якщо майбутніх немає, показуємо лише минулі, без порожнього блоку». */
export function EventsView({ upcoming, past }: { upcoming: PlaiEvent[]; past: PlaiEvent[] }) {
  const { t } = useLocale()

  return (
    <main className="mx-auto max-w-4xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mb-10">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {t.events.title}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft text-pretty">
          {t.events.lead}
        </p>
      </Reveal>

      <div className="flex flex-col gap-14">
        {upcoming.length > 0 && <EventList title={t.events.upcoming} events={upcoming} past={false} />}
        {past.length > 0 && <EventList title={t.events.past} events={past} past />}
        {upcoming.length === 0 && past.length === 0 && (
          <p className="rounded-3xl bg-surface-alt px-6 py-16 text-center text-base text-ink-soft">
            {t.events.empty}
          </p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Rewrite `app/events/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { getEvents, splitEvents } from '@/lib/events'
import { EventsView } from '@/components/events/events-view'

export const metadata: Metadata = {
  title: 'Події',
  description: 'Ярмарки, виставки та зустрічі з авторами мистецької крамнички ПІЧ.',
}

// Upcoming/past is decided at render time, so a short regeneration window both
// moves finished events to «Минулі події» and picks up new sheet rows.
export const revalidate = 300

export default async function EventsPage() {
  const { upcoming, past } = splitEvents(await getEvents())
  return <EventsView upcoming={upcoming} past={past} />
}
```

(Before writing it, confirm `revalidate` semantics in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/`. Per-event JSON-LD moves to the detail page.)

- [ ] **Step 5: Delete the mocks and the calendar code.** In `lib/data.ts`: delete `PlaiEvent`, `daysFromNow`, `events` and their comments, and change the header sentence "events will come from Google Calendar" to "events come from the owners' sheet (`lib/events.ts`)". In `lib/format.ts`: delete `UK_MONTHS_NOMINATIVE`, `EN_MONTHS_SHORT`, `formatEventDateTime`, `eventDateParts`, `monthLabel`, `monthKey`.
Then run `grep -rni "formatEventDateTime\|eventDateParts\|monthLabel\|monthKey\|addToCalendar\|events\.register\|googleCalendarUrl\|calendar.google" app components lib`. Expected: no output.

- [ ] **Step 6: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/event-card.tsx components/events/events-view.tsx app/events/page.tsx lib/data.ts lib/format.ts lib/i18n.ts
git commit -m "feat(events): upcoming/past store events, detached from the calendar"
```

Expected build output: `/events` builds. If `.env.local` has no sheet yet, the log shows the `EVENTS_SHEET_CSV_URL is not set` warning.

---

### Task 3: Event page `/events/[slug]` (title, date, short description) + sitemap

**Files:**
- Create: `components/events/event-detail.tsx`
- Create: `app/events/[slug]/page.tsx`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `getEvents`, `getEvent`, `isPast`, `formatEventDate`, `EventStatus`, `serializeJsonLd`, `WEBSITE_URL`.

- [ ] **Step 1: Create `components/events/event-detail.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { formatEventDate } from '@/lib/format'
import { useLocale } from '@/components/providers'
import { EventStatus } from '@/components/event-card'
import { Reveal } from '@/components/reveal'
import type { PlaiEvent } from '@/lib/events'

export function EventDetail({ event, past }: { event: PlaiEvent; past: boolean }) {
  const { t, locale } = useLocale()

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/events"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        {t.events.back}
      </Link>

      <Reveal className="mt-6 flex flex-col">
        <EventStatus past={past} />
        <h1 className="mt-3 text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {event.title}
        </h1>
        <p className="mt-4 inline-flex items-center gap-2 text-base text-ink-soft">
          <CalendarDays className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {formatEventDate(event, locale)}
        </p>
      </Reveal>

      {event.image && (
        <Reveal className="relative mt-8 aspect-[4/3] overflow-hidden rounded-3xl bg-surface-alt">
          <img src={event.image} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        </Reveal>
      )}

      <Reveal className="mt-8">
        <p className="text-lg leading-relaxed whitespace-pre-line text-ink text-pretty">{event.summary}</p>
      </Reveal>
    </main>
  )
}
```

- [ ] **Step 2: Create `app/events/[slug]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEvent, getEvents, isPast } from '@/lib/events'
import { serializeJsonLd } from '@/lib/json-ld'
import { WEBSITE_URL } from '@/lib/site'
import { EventDetail } from '@/components/events/event-detail'

// Same window as /events. dynamicParams stays true (the default): a row added
// to the sheet after the deploy must still get its page.
export const revalidate = 300

export async function generateStaticParams() {
  return (await getEvents()).map((e) => ({ slug: e.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Подію не знайдено' }
  return {
    title: event.title,
    description: event.summary,
    openGraph: { title: event.title, images: event.image ? [event.image] : undefined },
  }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date,
    endDate: event.endDate,
    description: event.summary,
    image: event.image?.startsWith('/') ? `${WEBSITE_URL}${event.image}` : event.image,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <EventDetail event={event} past={isPast(event)} />
    </>
  )
}
```

(`serializeJsonLd` already escapes `</script>` inside sheet text, see `lib/json-ld.ts`. Confirm in the Next 16 docs that `generateStaticParams` returning `[]` is valid with the default `dynamicParams`. It must not fail the build when the sheet is empty or unset.)

- [ ] **Step 3: Sitemap.** In `app/sitemap.ts`: `import { getEvents } from '@/lib/events'`, then

```ts
  const eventRoutes = (await getEvents()).map((e) => ({ url: `${WEBSITE_URL}/events/${e.slug}` }))
```

and return `[...staticRoutes, ...productRoutes, ...artistRoutes, ...eventRoutes]`.

- [ ] **Step 4: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add app/events components/events app/sitemap.ts
git commit -m "feat(events): permanent event pages"
```

---

### Task 4: Fixture run, owner sheet setup, env, docs

**Files:**
- Temporary, never committed: `public/events-fixture.csv`
- Modify: `.env.example`, `CLAUDE.md`, `.claude/docs/domain/events.md` (rewrite)

- [ ] **Step 1: Fixture.** Create `public/events-fixture.csv`, replacing `D-2`, `D-1`, `D0`, `D+1`, `D+3`, `D+4` with real dates relative to **today in Kyiv** (`YYYY-MM-DD`), and `D+10` with that date in `DD.MM.YYYY` form:

```csv
Назва,Дата,Дата завершення,Короткий опис,Фото,Slug
"Ярмарок, зимовий",D-1,,"Коротко, з комою.
Другий рядок з ""лапками"".",/images/template.jpg,
Сьогоднішня подія,D0,,Сьогодні,,
Триденна виставка,D-2,D+1,Ще триває,,tryden-vystavka
Майбутня зустріч,D+10,,Зустріч з авторкою,,
,,,,,
Без дати,,,Пропуск,,
Погана дата,2026-13-40,,Пропуск,,
Дубль,D+3,,Перший,,dubl
Дубль 2,D+4,,Той самий slug,,dubl
```

Set `EVENTS_SHEET_CSV_URL=http://localhost:3000/events-fixture.csv` in `.env.local` and restart `npm run dev`. After editing the fixture, a hard refresh bypasses the dev fetch cache.

- [ ] **Step 2: Expected results.**
  - Dev terminal shows exactly three warnings: `sheet row 7` (no date), `sheet row 8` (impossible date) and `sheet row 10` (duplicate slug `dubl`). Nothing appears for the blank row 6.
  - `/events` «Майбутні події» lists, in order: Триденна виставка (started D-2, still running), Сьогоднішня подія, Дубль, Майбутня зустріч, all «Незабаром». «Минулі події» lists only «Ярмарок, зимовий», marked «Відбулася» with a greyscale photo.
  - The Триденна виставка date renders as a range (e.g. «23–26 жовтня 2026», or the cross-month form). Майбутня зустріч (given as DD.MM.YYYY) shows the correct date. EN locale reads like «24 October 2026».
  - `/events/iarmarok-zymovyi-<D-1>`: title, date, status «Відбулася», and the summary on two lines with "лапками" in plain quotes. `/events/tryden-vystavka` works. `/events/nope` → 404. `/sitemap.xml` lists the five slugs.
  - Edit the fixture so every row is in the past: no «Майбутні події» heading at all. Header row only: the empty-state text.
  - Keyboard: one Tab stop per card, with a ring around the whole card. At 375 px the photo stacks above the text. With reduced motion there's no stagger.
  - Unset `EVENTS_SHEET_CSV_URL`: `/events` shows the empty state with one warning and nothing crashes. Point it at `http://localhost:3000/nope.csv`: the dev error overlay shows `sheet responded 404`, the intended loud failure.

- [ ] **Step 3: Drive photo check.** Upload a test image to Google Drive, share it "Anyone with the link", and put the share link in a fixture row's `Фото`. Expected: the card shows the image. If it doesn't render, drop the Drive branch from `toImage`, and the owner guide says photos must be direct `https://` image links.

- [ ] **Step 4: Clean up.** `rm public/events-fixture.csv`. Remove `EVENTS_SHEET_CSV_URL` from `.env.local`, or set the owners' real URL if you have it. `git status` must show neither file.

- [ ] **Step 5: `.env.example`.** Delete `GOOGLE_CALENDAR_API_KEY=` and `GOOGLE_CALENDAR_ID=`. Add:

```bash
EVENTS_SHEET_CSV_URL=             # server-only — owners' Google Sheet → File → Share → Publish to web → CSV link
```

- [ ] **Step 6: Rewrite `.claude/docs/domain/events.md`.** Cover:
  - **Source:** store events, detached from the calendar (client brief 2026-10, verbatim quote). Published by the owners in a Google Sheet (CSV, `EVENTS_SHEET_CSV_URL`), fetched in `lib/events.ts` with 5-min revalidate. Replaces the never-built Google Calendar plan.
  - **Model:** `PlaiEvent` and the sheet table from this plan.
  - **Rules:** the requirement → implementation table from this plan. Past = day after last day, Kyiv. Invalid rows are skipped with a warning naming the sheet row. Unset URL = no events. A Google error keeps the last good page.
  - **Owner setup** (send this to the owners as-is):
    1. Create a Google Sheet «Події крамнички». Row 1 headers: `Назва | Дата | Дата завершення | Короткий опис | Фото | Slug`.
    2. Select columns `Дата` and `Дата завершення` → Format → Number → Plain text. Enter dates as `2026-11-21` or `21.11.2026`. `Дата завершення` only for multi-day events.
    3. `Фото`: a Google Drive link to an image shared "Anyone with the link", or any public image link. (Use whichever Task 4 Step 3 confirmed.)
    4. File → Share → Publish to web → choose this tab → "Comma-separated values (.csv)" → Publish. Send the link to the developer.
    5. A new row appears on the site within about 10 minutes. Past events move to «Минулі події» by themselves.
    6. Don't delete rows of past events: they stay on the site as news. Don't change a published event's `Slug`. If `Slug` is empty, don't change its `Назва` either, because that changes its link.
  - **Not built (not in the brief):** time, location, long description, registration. Each would be one more column.
  - Remove the old «Записатись» section and the `lib/calendar/` boundary section.

- [ ] **Step 7: `CLAUDE.md`.**
  - Opening paragraph: "Events come from Google Calendar" → "Events are published by the owners in a Google Sheet (detached from the calendar, per the client brief)".
  - Scope item 4 → "**Events** — BUILT: store events from the owners' published Google Sheet (`lib/events.ts`), «Майбутні»/«Минулі» split, permanent `/events/[slug]` pages."
  - Architecture tree: `lib/calendar/ # PLANNED …` → `lib/events.ts # BUILT: Google Sheet CSV → events; lib/csv.ts parser; lib/slug.ts shared transliteration`. Add `/events/[slug]` to the `app/` line.
  - Env block: replace the two `GOOGLE_CALENDAR_*` lines with `EVENTS_SHEET_CSV_URL=... # server-only — published Google Sheet CSV; unset = no events`.
  - Architecture bullet "**Events**: read-only fetch from a public Google Calendar…" → "**Events**: read-only fetch of the owners' published Google Sheet (CSV), revalidated every 5 min; editing happens in the sheet."
  - "Current state": remove events from the "still mock or missing" list.

- [ ] **Step 8: Vercel.** Tell the user to add `EVENTS_SHEET_CSV_URL` to Vercel **Production and Preview**, and delete `GOOGLE_CALENDAR_API_KEY` / `GOOGLE_CALENDAR_ID` there if present. This can't be done from the repo.

- [ ] **Step 9: Commit**

```bash
git status   # no .env*, no events-fixture.csv
git add .env.example CLAUDE.md .claude/docs/domain/events.md
git commit -m "docs: store events come from the owners' sheet, calendar dropped"
```

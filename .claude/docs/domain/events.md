# Events

Store events: fairs, exhibitions, meetings with the shop's artists. **Detached from the calendar** (client brief 2026-10):

> Відв’язати їх від календаря ( ми публікуватимемо тут події по’язані з крамничкою)

**Source: the Notion «Події» database** (since 2026-10-30, branch `feat/notion-poc`) under the private page «Plai Pich — сайт». The site is read-only; the manager edits in Notion. Needs `NOTION_TOKEN` (the integration connected to that page) and `NOTION_EVENTS_DATA_SOURCE`; unset = no events, no throw. Reads are cached 5 min (uncached in `next dev`); «Оновити сайт» (`app/api/update-site`) expires them at once.

History: 2026-10-25 → 10-30 events came from a Google Sheet published as CSV. It was replaced because a Sheet has no drafts, no photo upload and no column types. The sheet code is gone. The internal row shape survives: `notionRows` turns pages into a header row plus rows so `toEvents` keeps one place for validation.

## Model (from the code — `PlaiEvent` in `lib/events.ts`)

```
PlaiEvent {
  slug       permanent URL identity: /events/<n>, the row's Notion «ID» number
  title
  date       'YYYY-MM-DD', the day or first day
  endDate?   'YYYY-MM-DD', multi-day events only
  time?      'HH:MM', the center's local time; absent for all-day events
  endTime?   'HH:MM', only when the event ends on the day it starts
  summary    card text and event page body
  titleEn?, summaryEn?   EN locale text; the Ukrainian is shown when absent
  image?     /api/notion-file/<page id> for an upload, else the external URL
}
```

## The «Події» columns

Columns are read by exact name. **A renamed column silently empties that field** (2026-11-02: «Короткий опис» → «Опис» hid every event); «Оновити сайт» names any missing column.

| Column | Required | Type | Notes |
|---|---|---|---|
| `Назва` | yes | title | |
| `Дата` | yes | date | «End date» for multi-day; «Include time» for a start (and same-day end) time |
| `Опис` | yes | text | card and event page; line breaks are kept on the event page |
| `Фото` | no | files | uploads go through `/api/notion-file/[id]` (Notion signs them for ~1 h) |
| `Показати` | — | checkbox | unticked = draft, never reaches `toEvents` (`isDraft`) |
| `Назва (EN)`, `Опис (EN)` | no | text | EN locale |
| `ID` | auto | unique id, no prefix | the URL, /events/12; set by Notion, never changes, never reused |
| `Нотатки` | no | text | the manager's own; the site never reads it |

Column order in the table view follows the manager's workflow: Назва, Дата, Показати, Фото, Опис, Нотатки, EN, ID.

## Business rules

| Brief | Implementation |
|---|---|
| Detach from the calendar; the store publishes its own events | Source is Notion. The homepage «Події» block is static copy (`components/landing/events-teaser.tsx`) |
| «Поточні події» / «Майбутні події» / «Минулі події» (owners, 2026-10-29: current events on top, past in a dropdown) | `EventsView` sections (`components/events/events-view.tsx`); past events sit in a collapsed native `<details>` with a count |
| No upcoming → only past, no empty block | each section renders only when non-empty; with nothing current or upcoming, the past dropdown starts open |
| Card: event date + clear status | `formatEventDate` + `EventStatus` (`eventBadge` in `lib/events.ts`): «Триває» on current events, «Незабаром» only on the nearest upcoming date (every event on that date; later ones get no badge), «Відбулася» on past. Past cards grey the text (`text-ink-soft`), not the photo |
| Event page: title, date, short description | `/events/[slug]` (`app/events/[slug]/page.tsx`) |
| Events don't disappear, they stay as news | no date cut-off anywhere; a page lives as long as its row |
| First = nearest or most recent | `splitEvents`: current and upcoming soonest-first, past newest-first |

- **Phase** (`eventPhase`), `Europe/Kyiv` days: **current** from the first through the last day (a one-day event is current on its day), **upcoming** before it, **past** from the day after the last day (`endDate ?? date`). Decided at render time; pages regenerate every 5 minutes, so events move between sections on their own.
- **Dates are never passed through `new Date()` for display** — `formatEventDate` splits the string, so a UTC server can't shift the day. With a time: «21 листопада 2026, 18:00–20:00».
- **JSON-LD times carry the Kyiv offset of that day** (`+02:00` / `+03:00` summer), computed with `Intl` in the event page; without it Google may read UTC.
- **Bad rows are skipped, never fatal.** Missing title/date/summary, an end before the start, or a missing ID → skipped with a Ukrainian reason, which the «Оновити сайт» report lists.

## Not built (not in the brief)

Location, long description, registration, linking an event to its artists. Each is one more column plus one line in `notionRows`/`toEvents` if the owners ask.

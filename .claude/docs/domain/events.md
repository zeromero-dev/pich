# Events

Store events: fairs, exhibitions, meetings with the shop's artists. **Detached from the calendar** (client brief 2026-10):

> Відв’язати їх від календаря ( ми публікуватимемо тут події по’язані з крамничкою)

**State: built 2026-10-25.** The owners keep events in a Google Sheet published as CSV (`EVENTS_SHEET_CSV_URL`). `lib/events.ts` fetches it with a 5-minute revalidate and maps rows to `PlaiEvent`. This replaces the Google Calendar plan, which was never built. The site is read-only; editing happens in the sheet.

**Connected locally (2026-10-29)** to a dev Sheet filled with `[ТЕСТ]` rows; verified on the dev server: ordering, statuses, event pages, sitemap, the skipped broken row. Vercel and the owners' real Sheet are still to do.

**The URL can be a plain Share link** (`…/spreadsheets/d/<id>/edit?usp=sharing`, sheet shared "Anyone with the link: Viewer"): `toCsvUrl` rewrites it to `/export?format=csv` (first tab, or the `gid` in the link). A "Publish to web" CSV link (`/d/e/…`) also works unchanged. If Google answers with HTML (sheet not shared), `getEvents` throws instead of rendering no events.

### Why a Google Sheet (and not a Doc, a CMS, or a DB)

The client has no store for events, and it has to be free. A Sheet fits:

- **Structured, so we can parse it.** One row per event, one column per field, exported as CSV by Google from a plain view-only Share link, with no API key, OAuth or quota. A Google **Doc** is free-form prose: you'd need the Docs API plus a service account, and every owner formatting slip (a bold date, a merged paragraph) would silently break parsing. Don't use a Doc.
- **The owners already know the tool**, and Google keeps edit history for free.
- **Ruled out:** a headless CMS (another account and login, and free tiers change), events as code in the repo (owners can't edit it), and the CRM (events would have to be faked as products in a «Події» category, with the date crammed into a product field, and every catalog, stock and checkout path would need to filter them out).
- **Ceiling:** no drafts, no validation at entry time (bad rows are skipped and logged, see below), and changes take up to ~5 minutes to appear. If the owners outgrow this, the next step is a free headless CMS, not our own DB.

## Model (from the code — `PlaiEvent` in `lib/events.ts`)

```
PlaiEvent {
  slug      permanent URL identity: /events/<slug>
  title
  date      'YYYY-MM-DD', the day or first day
  endDate?  'YYYY-MM-DD', multi-day events only
  summary   card text and event page body
  image?    https:// URL or /images/... path
}
```

## The sheet

Row 1 holds the headers (case-insensitive, trimmed, any column order). One row = one event.

| Header | Required | Format | Notes |
|---|---|---|---|
| `Назва` | yes | text | |
| `Дата` | yes | `2026-11-21` or `21.11.2026` | the day of the event, or its first day |
| `Дата завершення` | no | same | only for multi-day events, so the event stays «Триває» until its last day |
| `Короткий опис` | yes | text | card and event page; line breaks are kept on the event page |
| `Фото` | no | any `https://` image URL, `/images/...`, or a Google Drive share link | Drive links are rewritten to `lh3.googleusercontent.com/d/<id>` — **unverified**, see below |
| `Slug` | no | Latin, e.g. `zymovyi-yarmarok-2026` | permanent URL. Empty → derived from title + date, so editing the title changes the URL |

## Business rules

| Brief | Implementation |
|---|---|
| Detach from the calendar; the store publishes its own events | Source is the owners' sheet. Mocks and all calendar code are gone. The homepage «Події» block is static copy (`components/landing/events-teaser.tsx`) |
| «Поточні події» / «Майбутні події» / «Минулі події» (owners, 2026-10-29: current events on top, past in a dropdown) | `EventsView` sections (`components/events/events-view.tsx`); past events sit in a collapsed native `<details>` with a count |
| No upcoming → only past, no empty block | each section renders only when non-empty; with nothing current or upcoming, the past dropdown starts open |
| Card: event date + clear status | `formatEventDate` + `EventStatus` (`eventBadge` in `lib/events.ts`): «Триває» on current events, «Незабаром» only on the nearest upcoming date (every event on that date; later ones get no badge), «Відбулася» on past. Past cards grey the text (`text-ink-soft`), not the photo |
| Event page: title, date, short description | `/events/[slug]` (`app/events/[slug]/page.tsx`) |
| Events don't disappear, they stay as news | no date cut-off anywhere; a page lives as long as its row |
| First = nearest or most recent | `splitEvents`: current and upcoming soonest-first, past newest-first |

- **Phase** (`eventPhase`), `Europe/Kyiv` days: **current** from the first through the last day (a one-day event is current on its day), **upcoming** before it, **past** from the day after the last day (`endDate ?? date`). Decided at render time; pages regenerate every 5 minutes, so events move between sections on their own.
- **Dates are never passed through `new Date()` for display** — `formatEventDate` splits the string, so a UTC server can't shift the day.
- **Bad rows are skipped, never fatal.** Missing title/date/summary, an impossible date, an end before the start, or a duplicate slug → the row is skipped with a `console.warn` naming its sheet row. Blank rows are ignored silently.
- **Unset URL = no events**, one warning, no throw — a missing sheet must not break the shop build.
- **A non-200 from Google throws** on purpose: during ISR Next keeps serving the last good page.
- Content language: whatever the owners type (Ukrainian in practice), shown as-is in both locales ([i18n.md](i18n.md)).

Verified 2026-10-25 with a local fixture CSV: ordering, the multi-day range, `DD.MM.YYYY` input, quoted commas/newlines/`""`, the three skip warnings, all-past and empty sheets, 404 for an unknown slug, the sitemap entries, and the loud failure on a 404 sheet URL. **Not verified:** Google Drive photo links (needs a real shared file) — until checked, tell the owners to use a direct `https://` image link if a Drive photo doesn't show.

## Owner setup

The owners get a ready template, `podii-kramnychky.xlsx`, to upload to Google Drive and open with Google Sheets. Its «Події» tab has the headers and every cell set to plain text. Its «Інструкція» tab is a short owner guide in Ukrainian: one line per column, how to add a photo from Google Drive (a folder shared "Anyone with the link: Viewer", copy each file's link; depends on the unverified Drive rewrite above), a privacy warning (the sheet is readable by anyone with the link), don't delete past events, don't rename headers, and an example row. On `Slug` it says only this: it's the end of the event's address; it's optional (built from title + date); if filled, use Latin with hyphens and never change it after publishing. It isn't in the repo yet (it was made in a session scratchpad); add it when we hand it over.

## Not built (not in the brief)

Start time, location, long description, registration, drafts. Each is one more sheet column plus one line in `toEvents` if the owners ask.

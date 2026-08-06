# Events

Exhibitions, майстер-класи, and talks at the center. **Google Calendar is the scheduling system**; the owners create and edit events there. This app is a read-only display — it never writes to the calendar.

## Model (from the code — `PlaiEvent` in `lib/data.ts`)

```
Event {
  id           calendar event id
  title
  start        ISO datetime
  location     free text ("Плай Піч, студія")
  description
}
```

No end time in the model today — display shows start only; "add to calendar" assumes 2 hours (see below).

## Business rules

1. **Read-only projection.** Scheduling, editing, cancelling all happen in Google Calendar. This app has no event-management use cases and must never grow them.
2. Events are displayed soonest-first; the landing shows the next 3, the events page shows all upcoming.
3. Content language: whatever the owners type into Google Calendar (Ukrainian in practice) — displayed as-is in both locales, same policy as catalog content ([i18n.md](i18n.md)).

## "Registration" is not registration (from the code — `components/event-card.tsx`)

The "Записатись" button builds a Google Calendar *template* link (`calendar.google.com/render?action=TEMPLATE`) — it adds the event to the **visitor's own calendar** with an assumed 2-hour duration. Nothing is recorded on our side; the owners don't know who "registered". This is a deliberate v1 simplification — treat any request for real signup (headcount, contact capture, limited seats like "кількість місць обмежена") as a new feature needing a decision, since we have no DB to store registrations.

## Boundary: `lib/calendar/` (planned; today mocked in `lib/data.ts`)

Server-only fetch of a public calendar via API key — `GOOGLE_CALENDAR_API_KEY` + `GOOGLE_CALENDAR_ID` env vars (never `NEXT_PUBLIC_`). Spec:

- Google Calendar API `events.list`: `singleEvents=true` (expands recurring events), `orderBy=startTime`, `timeMin=now` — upcoming only.
- Mapping: `summary` → title, `start.dateTime` → start, `location`, `description`. All-day events (`start.date`, no time) need a display decision when one first appears — assume none for now.
- Cache ~5–15 min, same politeness reasoning as the catalog.
- The calendar must be set public; API-key access only reads public calendars. (Setup step for the owners, not code.)

## Open decisions

- Real registration flow (see above) — out of scope for v1 unless the owners ask.
- Event end times: read `end.dateTime` from the calendar instead of assuming 2 hours? Trivial once `lib/calendar/` exists — do it then.

# Plai Pich — Domain Docs

Spec-driven domain reference. Each doc covers one bounded context: its **model and business rules**, its **use cases**, its **boundary** (where data enters/leaves and which module owns that), and **open decisions**. Facts are tagged by source ("from the code", "from the API docs", "assumption"). When something specified here gets built, move it to fact.

Style rule for these docs: abstract the *rules*, not the code. Boundaries are named by real module paths (`lib/data.ts`, planned `lib/hugeprofit/`), not invented interfaces. The one deliberate exception is the payment provider in [checkout.md](checkout.md) — that swap point is part of the spec because the provider is undecided.

UI, styling, and motion live in `../ui-ux-guidelines.md` — never here.

## Bounded contexts

| Context | Doc | Source of truth | Boundary module |
|---------|-----|-----------------|-----------------|
| Catalog | [catalog.md](catalog.md) | HUGEPROFIT CRM | mock `lib/data.ts` → planned `lib/hugeprofit/` |
| Cart | [cart.md](cart.md) | The buyer's browser (a draft, never authoritative) | `components/providers.tsx` + localStorage |
| Ordering | [checkout.md](checkout.md) | CRM (orders) + payment provider (TBD) | planned `app/api/checkout/` |
| Events | [events.md](events.md) | Google Calendar (read-only) | mock `lib/data.ts` → planned `lib/calendar/` |
| Artists & Content | [artists.md](artists.md) | This repo (content-as-code) | `lib/data.ts` |
| Locale | [i18n.md](i18n.md) | `lib/i18n.ts` (cross-cutting concern, not a true context) | `lib/i18n.ts` |

## Ubiquitous language

Ukrainian terms are primary — they appear in the UI and in conversations with the owners.

| UA | EN | Meaning here |
|----|----|--------------|
| Крамничка | Shop | The online store. Not "магазин" — the diminutive is part of the brand voice. |
| Робота | Work | The central entity of Catalog. Always a one-of-a-kind physical original — never a SKU with inventory depth. |
| Митець / мисткиня | Artist | Creator of works; exhibits at the center. |
| Подія | Event | Exhibition, майстер-клас, talk. Scheduled in Google Calendar; this app only displays it. |
| Кошик | Cart | The buyer's draft order. Client-side only. |
| Замовлення | Order | Created in the CRM at checkout; the CRM is the order system of record. |

## Cross-context rules

- **No own persistence.** Every context's source of truth is external (CRM, Google Calendar), local-to-client (browser), or compiled-in (repo content). This app stores nothing server-side.
- **Secrets stay server-side.** CRM and Calendar calls happen only in Server Components / Route Handlers.
- **Money crosses boundaries only as customer price.** `net_price` (merchant cost) must die inside `lib/hugeprofit/` — see [catalog.md](catalog.md).
- **Client state is never authoritative.** Prices, availability, and totals shown client-side are advisory; Ordering re-derives everything server-side — see [checkout.md](checkout.md).

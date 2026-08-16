@AGENTS.md

# Plai Pich

Plai Pich is a local art center — a place for people to gather and display their art. This repo is its website: a landing page, an online shop (крамничка), an events calendar, and artist pages. There is **no own database and no S3** — the HUGEPROFIT CRM (`https://crm.h-profit.com`) is the single backend: it holds products, prices, stock, images, and receives orders. Events come from Google Calendar.

**Current state (2026-08-12): catalog and artists are live.** Shop, product pages, the 53 artist pages, landing and sitemap read the real CRM through `lib/hugeprofit/` (252 sellable works of 258, 5-min ISR). Search, tree-aware category filters, price sort and the in-stock toggle all run client-side over that one cached list. Checkout creates real CRM orders, unpaid — the owners follow up to arrange payment (decided 2026-08-12). Still mock or missing: events (`lib/data.ts` → Google Calendar), artist bios (`artistProfiles`, empty), and online payment. Footer address (вул. Григорія Сковороди, 25, Вінниця) and hours (щодня 11:00–21:00, confirmed 2026-09-06) are real since 2026-09-06, and the footer carries the UCORD / Swiss Confederation / NIRAS funding notice (`public/images/sponsors/`, text in `lib/i18n.ts`). All local photography is one temporary interior photo, `public/images/template.jpg`, until real photos arrive; the older mock images under `public/images/` are unreferenced. UI conventions: `lib/motion.ts` (motion tokens; components import `m` from `motion/react`, never `motion` — `components/providers.tsx` wraps the tree in `LazyMotion strict`, so a stray `motion.` throws), `lib/i18n.ts` (UA/EN dictionaries + client-side locale switch), `lib/format.ts` (₴/date formatting), monochrome tokens in `app/globals.css`.

## Stack

- Next.js 16.3.0 (App Router) + React 19 + TypeScript — **Next 16 has breaking changes vs. training data; read `node_modules/next/dist/docs/` before writing Next-specific code** (run `npm install` first if `node_modules/` is missing)
- Tailwind CSS 4 (via `@tailwindcss/postcss`)
- No DB, no ORM, no S3, no auth provider — deliberately
- Two locales: Ukrainian (default) + English — decided 2026-08-06, so build locale-aware routing from the start rather than retrofitting

## Scope / Requirements

1. **Landing** — about the art center
2. **Крамничка (Shop)** — catalog from CRM, product pages, cart, checkout that creates an order in the CRM
3. **Product search** — implemented in-app (the CRM API has no search endpoint)
4. **Events calendar** — Google Calendar integration to schedule and display events
5. **Artist pages** — BUILT: roster derived from CRM brands, per-artist pages at `/artists/[slug]`. Bios/portraits are repo content (`artistProfiles`), still unwritten
6. **Online payment** — a Ukrainian payment provider (LiqPay / monobank / Fondy / WayForPay — which one is not decided yet). Checkout must be structured so the payment step runs before order creation in the CRM.

## Principles

1. **Don't assume — consult first.** When not explicitly asked to decide, ask before acting.
2. **Incomplete but accurate > complete but speculative.** State what you don't know rather than filling gaps with plausible-sounding guesses.
3. **Examine before agreeing.** Challenge flawed ideas with specific doubts, not reflexive validation.
4. **Tag your sources.** "From the code at…", "From the API docs…", "I'm assuming…", "I don't know whether…".
5. **Comments: 2–3 lines max, constraints only.** Never narrate what the next lines do; comment only what code cannot show.
6. **Keep this file honest.** It documents plans as plans and facts as facts; when you build something planned here, move it to fact (or correct it).

## Development Commands

```bash
npm install        # required once — node_modules is not committed
npm run dev        # dev server at http://localhost:3000 (regenerates AGENTS.md — commit it, don't fight it)
npx react-doctor@latest   # ALWAYS before `npm run build`: fix every finding, or record a deliberate exception with its reason in doctor.config.mjs
npm run build      # production build (also the de-facto typecheck)
npm run lint       # eslint
```

Config and secrets live in `.env.local` (gitignored via `.env*`, so there is no
`.env.example` — this block is the reference):

```bash
WEBSITE_URL=https://plaipich.art  # required — production builds throw without it
HUGEPROFIT_API_KEY=...            # server-only — no NEXT_PUBLIC_ prefix, ever
GOOGLE_CALENDAR_API_KEY=...       # server-only
GOOGLE_CALENDAR_ID=...
LIQPAY_PUBLIC_KEY=...             # server-only — LiqPay sandbox or live public key
LIQPAY_PRIVATE_KEY=...            # server-only — never exposed to the client
LIQPAY_SANDBOX=1                  # "1" routes payments through LiqPay's sandbox
```

`WEBSITE_URL` is the absolute origin baked into `metadataBase`, the sitemap, the
Organization JSON-LD `logo` and the OG card (`lib/site.ts`). Every consumer is
server-side, so it takes no `NEXT_PUBLIC_` prefix. It falls back to
`http://localhost:3000` in dev and **throws at build time in production** — a
wrong origin ships dead logo and preview URLs to Google rather than failing
visibly. **It must be set in the Vercel project settings, not just locally.**

## Architecture

Server-first for backends: all CRM and Google Calendar calls happen in Server Components / Route Handlers so tokens never reach the browser.

```
app/                 # BUILT: /, /shop, /shop/[slug], /events, /about, /artists, /artists/[slug], /checkout
components/          # BUILT: header, footer, cart-drawer, per-page views, motion primitives (reveal.tsx)
lib/data.ts          # BUILT: domain types + mock events (catalog and artist mocks are gone)
lib/artists.ts       # BUILT: layers repo-authored bios onto the CRM-derived roster
lib/hugeprofit/      # BUILT: typed CRM client — client.ts (authed fetch), map.ts (CRM→domain), index.ts (catalog API)
lib/calendar/        # PLANNED: Google Calendar fetch (public events, API-key access)
app/api/checkout/    # BUILT: validate fresh stock + price → redirect to LiqPay → webhook → POST /bapi/remote_orders (paid)
lib/hugeprofit/orders.ts  # BUILT: order payload mapping + crmPost with payment tracking
```

- **Catalog & search**: fetch the full product list server-side and cache it (Next fetch cache / ISR, ~5 min revalidate). Search and category filtering run over that cached list — an art-center catalog is small enough that this beats building infrastructure. Revisit only if the catalog outgrows one page (`limit` default is 500).
- **Cart**: client-side only (localStorage / context). No server session.
- **Checkout**: our Route Handler re-reads every line from the CRM uncached, rejects sold or repriced works, computes the total server-side, then creates a remote order. Orders are **unpaid** (`info.is_paid: false`) — the owners follow up. `order_id` is `Date.now()` (the API documents an int, so no UUID). When a payment provider is chosen it slots in *before* order creation.
- **i18n**: UA (default) + EN via App Router locale segments; UI strings in per-locale dictionaries. Product names/descriptions come from the CRM in whatever language they're entered — don't promise translated catalog content.
- **Events**: read-only fetch from a public Google Calendar; scheduling happens in Google Calendar itself, the site only displays.

## Knowledge Base

All AI context docs live under `.claude/docs/` — don't scatter `.md` files elsewhere in the repo.

```
.claude/docs/
├── ui-ux-guidelines.md   # design tokens, motion rules, page blueprints — read before styling anything
└── domain/               # spec-driven domain docs — read the relevant one before working in a context
    ├── README.md         # context map + ubiquitous language — start here
    ├── catalog.md        # Work entity, pricing rules, net_price rule, CRM mapping spec
    ├── cart.md           # draft-order semantics, snapshot staleness, never-authoritative policy
    ├── checkout.md       # ordering flow spec, payment-before-order rule, PaymentProvider interface
    ├── events.md         # Google Calendar projection, "registration" caveat
    ├── artists.md        # content-as-code policy, fragile name join to catalog
    └── i18n.md           # UI-bilingual/content-single-language rule, formatting rules
```

Domain docs record **what is built** vs **what is spec** — when you build something specified there, move it to fact. Doc style: business rules and use cases, boundaries named by real module paths; no invented interfaces (the payment provider is the one deliberate exception).

## HUGEPROFIT CRM API

Docs: https://api-doc.h-profit.com/api_documentation/ — base URL `https://crm.h-profit.com/bapi/`, auth via `Authorization: <token>` + `Content-Type: application/json` headers. (All field names below are from the API docs, not verified against a live account yet.)

Endpoints we care about:

| Endpoint | Use |
|----------|-----|
| `GET /bapi/products` | Catalog. Filters: `category_id`, `warehouse_id`, `product_id`, `modify_start`/`modify_end`; pagination `limit` (default 500) / `offset`; `count=1` returns just `{"total": n}`. Returns `name`, `description`, `sku`, `barcode`, `images[]` (full CRM-hosted URLs), `categories`, `brand`, `attr[]`, and per-warehouse `stock[]` with `instock`, `quantity`, `net_price`, `price`, `sale_price`. |
| `GET /bapi/product_categories` | Category tree for shop navigation. |
| `POST /bapi/remote_orders` | Checkout. Required: `order_id` (ours), `price`, `currency` (`"UAH"`), `first_name`, `address_1`, `order_data[]` (`product_id`, `sku`, `name`, `quantity`, `price`, `total`). Optional: `phone`, `email`, `last_name`, `status` (default `"pending"`), `info`. Response includes `reservedProducts`. |
| `GET /bapi/remote_orders` | Order status lookups; filters `start`/`end` on `date_modified`, defaults to last 3 months. |
| `GET /bapi/reference_info` | `types=` comma list: `sales_channels`, `warehouses`, `brand`, `accounts`, `products_category`. |

## Key Gotchas

- **The CRM `description` renders verbatim — and 171 of 258 descriptions are internal notes** (bank cards, IBANs, tax ids, legal names, phones, cost prices, pasted chat messages). Owners' decision 2026-08-12: they clean the field in the CRM, the site just displays it. So **anything typed into that field is published.** Don't add a sanitiser — it can't be done reliably and would read as safety it doesn't provide. It is kept out of `<meta description>`/JSON-LD deliberately. See `.claude/docs/domain/catalog.md` rule 3.
- **`net_price` is the cost price.** It arrives inside every product's `stock[]` entry. Strip it in `lib/hugeprofit/` before data ever reaches a component or API response — leaking merchant margins to shoppers is the second-worst realistic bug this site can have. Customer price is `price` / `sale_price`.
- **The CRM API has no text search and no webhooks.** Search is ours (over the cached catalog). Freshness is time-based revalidation only — treat displayed stock as advisory and re-check stock server-side at checkout.
- **CRM token is server-only.** Any `fetch` to `crm.h-profit.com` from client code is a bug by definition.
- **Use plain `<img>`, never `next/image`** — decided 2026-08-06, re-confirmed 2026-08-12 against live numbers. The `@next/next/no-img-element` ESLint rule is disabled for this. Keep the habits `next/image` gave for free: fixed `aspect-ratio` containers (no layout shift), `loading="lazy"` below the fold, `fetchPriority="high"` on hero/LCP images. Product images are CRM-hosted (`https://crm.h-profit.com/bimages/get/...`) and load directly from there, which costs Vercel nothing.

  Why not revisit it: **the project stays on the Vercel Hobby plan**, where blowing the Image Optimization quota does not bill you — it returns 402 and the browser renders `alt` text instead of the artwork. 298 CRM images × ~5 widths ≈ 1 500 transformations against a 5 000/month allowance, on a catalog that only grows. The shop grid is paginated instead (`PAGE_SIZE` in `components/shop/shop-view.tsx`), which caps what a scroll pulls. The CRM serves no resized variants, no WebP, and `Cache-Control: max-age=0` — all verified, don't re-probe.
- **`AGENTS.md` is auto-(re)generated by `next dev`.** Commit it alongside your work; deleting it from a diff just recreates an uncommitted change.
- **Rate limits are undocumented.** Don't hammer the CRM per-request — the catalog cache is also our politeness layer.
- **Next 16 makes fetch caching opt-in**, and a request carrying an `Authorization` header needs `cache: 'force-cache'` explicitly — `next.revalidate` alone is not enough. See `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`.
- **The API docs site mirrors cleanly.** `https://api-doc.h-profit.com/search/search_index.json` is the whole documentation (EN + UA + Types + Changelog) in one JSON — faster and more complete than scraping pages.
- **Live-account quirks** (verified 2026-08-12): the product field is `category` (singular), not `categories`; `brand` is an object that is `{}` when unset; `product_id` accepts one id only (a comma list errors); `warehouse_id` is ignored when `count=1`; product images are public and need no auth header.

## Open Decisions (do not build these without confirming)

- **Artist roster**: `lib/data.ts` still has 3 invented artists while the CRM has 71 real brand names, so `/artists` currently shows fiction. Needs owner input on who gets a page.

Settled 2026-08-12 (don't reopen without the owners): no sales channel; `delivery_cost` always 0; order status stays `"pending"` with `info.is_paid` signalling payment; CRM `size` is centimetres. Payment provider is LiqPay (decided 2026-08-16).

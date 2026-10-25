# Client Brief: Audit, Decisions, Plan Index

**Sources of truth:** `task/TASK_UK.md` (the client's original Ukrainian brief, **the only source for production copy**) and `task/TASK.md` (English working translation with planning notes). Where either conflicts with `CLAUDE.md`, `.claude/docs/domain/*` or older plans, **the brief wins**. Every plan updates the docs it overrides.

`task/TASK_UK.md` is 18 MB because the reference images are embedded as base64. Read its text with:

```bash
grep -v '^\[image[0-9]*\]: <data:' task/TASK_UK.md | awk 'length($0) < 3000'
```

The same images are in `task/assets/image1.webp` … `image10.webp`.

**Status (2026-10-25):** planning complete, nothing implemented. Implementation starts in a fresh session: read this file first, then the plan being executed.

---

## 1. Audit: what the brief asks vs. what exists

| # | Brief item | Today (from the code) | Gap | Plan |
|---|---|---|---|---|
| 1.1 | Menu: Крамничка → Митці → Події → Про нас → Співпраця | `components/header.tsx` order is Крамничка, Події, Про нас, Митці. No collaboration page. The footer duplicates the array | Reorder, add `/collaboration`, one shared list | P5 |
| 1.2 | Footer: Доставка та оплата, Обмін та повернення, Політика конфіденційності | Nothing exists | Pages with **placeholder** text + links | P5 |
| 2.1 | Home: hero → Категорії → Новинки → Події block → Люди, які створюють ці роботи | `app/page.tsx`: Hero → EventsPreview (mock) → FeaturedWorks grid → AboutTeaser | Restructure | P3 |
| 2.2 | Categories carousel, 4–6 visible on desktop, next card peeks on mobile | Categories exist only as shop filter chips. No `?category=` URL | Carousel + root-category tiles + shop deep link | P3 |
| 2.3 | Новинки carousel | `FeaturedWorks` = first 8 works in a grid | Carousel of the 12 newest in-stock works + "Уся крамничка" | P3 |
| 2.4 | «Події» text + photo + button, detached from the calendar | `events-preview.tsx` lists 3 **mock** events | Static editorial block | P3 |
| 2.5 | Artists carousel | Roster only on `/artists` | Carousel reusing the roster card | P3 |
| 3.1 | «Додати в кошик» on cards on hover | Card is a single `<Link>` | Card button with a touch fallback | P2 |
| 3.2 | Uniform photo frames? (question) | **Already uniform:** `aspect-[4/5]` + `object-contain`, no cropping | Decision only (§3) | — |
| 3.3 | Remove «Останнє» from cards | Card shows it when `isLast` | Delete badge (display only) | P2 |
| 4.1 | «Автор:» + underlined, clickable name | Bare name link | Label + underline | P2 |
| 4.2 | Quantity selector | **Blocked by design:** cart type `qty: 1`, checkout rejects `qty !== 1`, webhook checks only `inStock` | Domain change across cart, checkout and webhook | P1 |
| 5 | Artist page layout (image9), works stay below | Name, count, optional bio, works. `artistProfiles = {}` | Two-column header when a portrait exists | P2 |
| 5 | Video next to photos? (question) | No media model | Decision only (§3) | — |
| 6 | Events detached from the calendar; upcoming/past; archive; detail page with title, date, short description; newest/nearest first | **No calendar integration exists** (`lib/calendar/` was planned, never built). 5 invented mocks in `lib/data.ts`. No detail pages | Detached from the calendar: owners publish in a **Google Sheet**, upcoming/past split, `/events/[slug]` with title, date, short description | P4 |
| 7 | Copy: hero, Події block, Співпраця, Про нас, Митці | Different, developer-written copy in `lib/i18n.ts` | Verbatim from `TASK_UK.md` (already copied into P3/P5) | P3, P5 |

## 2. Conflicts with existing docs (the brief wins)

1. **Boolean availability / qty 1** (`catalog.md` rule 1, `cart.md`, `checkout.md` rule 2): replaced by "1 ≤ qty ≤ CRM `instock`, re-checked server-side at checkout and in the webhook" (P1).
2. **«Остання» as scarcity info on cards** (`catalog.md` rule 1): removed from cards. The product page keeps it (P2).
3. **"Google Calendar is the scheduling system"** (`events.md`, `CLAUDE.md`, `.env.example` `GOOGLE_CALENDAR_*`): replaced, per the brief («Відв’язати їх від календаря»), by store events the owners publish in a Google Sheet (P4). Events carry only what the brief names: title, date (+ optional end date), short description, photo.
4. **Mock events are invented records**: deleted in P4. `/events` shows an empty state until the sheet has rows.
5. **The calendar-template «Записатись» button** on event cards: removed. It only added the event to the visitor's own calendar, and the brief detaches events from calendars (P4).
6. **Unrelated, flagged only:** `shop.lead` says «Кожна — єдина» ("each one unique"). That is false for this craft catalog and more visibly so with a quantity selector. Not in the brief, so it is not changed. Ask the owners.

## 3. Decisions

### Made by the user (2026-10-25)
| # | Decision |
|---|---|
| D1 | `task/TASK_UK.md` is the original. All UA copy is copied from it verbatim (P3, P5 already contain it) |
| D2 | **Events are detached from the calendar exactly as the brief says.** The owners publish them in a Google Sheet (published CSV, fetched server-side). Settled 2026-10-25 after a brief detour to Google Calendar. P4 |
| D3 | Delivery / returns / privacy pages ship now with **placeholder** text (P5) |
| D4 | Instagram URL and contact email use **placeholders** (P5, `lib/contacts.ts`) |

### Defaults the plans implement (no answer yet; change before executing if needed)
| # | Default |
|---|---|
| A1 | **EN locale:** new/changed copy uses the English from `task/TASK.md` §7 |
| A2 | **Brand name:** only the visible copy changes (hero title «Мистецька крамничка ПІЧ» from the brief). Logo, metadata `title` template and JSON-LD keep «Плай Піч» |
| A3 | **Homepage categories:** root categories (top of each work's CRM chain), most works first, all in the carousel |
| A4 | **Новинки:** the 12 newest in-stock works (CRM order), no «NEW» badge, plus a «Уся крамничка» button |
| A5 | **Events block photo:** `/images/template.jpg` (the only real photo) |
| A6 | **Card add-to-cart:** mouse = full-width bar revealed on hover/focus. Touch = always-visible round «+» on the image corner. Adds 1, does not open the drawer |
| A7 | **Quantity:** 1…`instock`. Stepper hidden when only 1 is available. The cart drawer gets the same stepper |
| A8 | **Events rules:** Kyiv time. Past from the day after the last day. Optional end date and start time. Labels «Незабаром» / «Відбулася». Upcoming soonest-first, past newest-first ("першою є завжди найновіша подія або найближча") |
| A9 | **AboutTeaser** («Місце, а не лише вітрина») is removed from the homepage: it's not in the brief's section list |
| A10 | **URLs:** `/collaboration`, `/delivery`, `/returns`, `/privacy` (English, like `/shop`, `/events`) |
| A11 | **Artists carousel style:** reuse the `/artists` roster card (image5 in the brief is a duplicate of image2) |

### Not planned: need the client's answer first
- **Photo frames (§3.2).** A: keep as is (recommended, nothing gets cropped). B: `object-cover` (fills the frame, crops artwork edges; there is no focal-point data). C: contain with less padding. Each is a one-class change in `components/product-card.tsx`.
- **Artist video (§5).** A: YouTube/Instagram link in `artistProfiles` rendered as a click-to-load embed (recommended, about half a day). B: self-hosted MP4 (not recommended on Vercel Hobby bandwidth).

## 4. Placeholders to resolve before launch

Every placeholder carries the literal marker `PLACEHOLDER`, so this finds them all:

```bash
grep -rn "PLACEHOLDER" app components lib
```

| Where (after P5) | What | Who resolves |
|---|---|---|
| `lib/contacts.ts` `instagramUrl` | The brief links one post (`instagram.com/p/DDRIEwxtc9g`), not the profile. Placeholder = the handle's profile URL, unverified | Owners confirm the URL |
| `lib/contacts.ts` `email` | `art.store.pich@gmail.com` (from the brief). The footer separately shows `hello@plaipich.art` | Owners confirm which address goes where |
| `lib/info-pages.ts` (3 pages) | Placeholder notice instead of delivery / returns / privacy text. Pages are `noindex` and left out of the sitemap while `placeholder: true` | Owners supply the texts |

## 5. Plans and sequence

| Plan | File | Depends on |
|---|---|---|
| P1 Cart quantity | `2026-10-25-cart-quantity.md` | — |
| P2 Product card, product page, artist page | `2026-10-25-product-and-artist-pages.md` | none (adapts if P1 missing) |
| P3 Homepage | `2026-10-25-homepage.md` | none (carousels use whichever card version exists) |
| P4 Store events (detached from the calendar) | `2026-10-25-events-archive.md` | none (adapts if P3 missing) |
| P5 Navigation, footer, content pages, copy | `2026-10-25-navigation-and-content.md` | — (any time) |
| Payments go-live (pre-existing, still open) | `2026-09-09-liqpay-production-cutover.md` | Independent. If P1 has shipped, the real-purchase check also covers qty |

**Any order works.** P2 and P4 each open with a check that adapts them if P1/P3 haven't shipped. P1 → P2 → P3 → P4 is still the order with the fewest merge conflicts in shared files (`lib/i18n.ts`, `app/sitemap.ts`, `components/shop/product-detail.tsx`). Each plan is one PR-sized branch: start each with `git checkout -b feat/<plan-name>` from an up-to-date `master` (never commit on `master`).

Removed on 2026-10-25 as fully executed (shipped in `6f05794 feat: LiqPay checkout (#1)`): `2026-08-16-liqpay-payment-integration.md`, `2026-09-06-liqpay-go-live.md`, `2026-09-07-liqpay-dev-shop-rehearsal.md`, `2026-09-09-merge-ready-payments-off.md`. Their execution ledgers remain in `.superpowers/sdd/`. The sandbox-rehearsal procedure P1 needs is copied into P1 Task 4. The LiqPay design spec was removed too; its rules live in `.claude/docs/domain/checkout.md`.

## 6. Verification conventions (all plans)

- The repo has **no test framework**, deliberately, and Node is 20.19, which can't run TypeScript directly. Every task verifies with
  `npx react-doctor@latest` (fix every finding, or record a reasoned exception in `doctor.config.mjs`) → `npm run lint` → `npm run build` (the typecheck), plus the task's own `curl` / browser check.
- Responsive checks at **375, 768, 1024, 1280 px** in `npm run dev` (http://localhost:3000). Keyboard-only pass (Tab, Shift+Tab, Enter, Space, Esc). `prefers-reduced-motion: reduce` on (DevTools → Rendering).
- No horizontal page scroll at any width: in the console, `document.documentElement.scrollWidth === innerWidth` must be `true`.
- Components import `m` from `motion/react`, never `motion.` (`LazyMotion strict` throws).
- Next 16 differs from training data: before using a Next API, read its page under `node_modules/next/dist/docs/` (run `npm install` first if `node_modules/` is missing).
- `next dev` regenerates `AGENTS.md`. Commit it if it changes.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Never commit `.env.local`, keys, tunnel URLs or test fixtures. Check `git status` before each commit.

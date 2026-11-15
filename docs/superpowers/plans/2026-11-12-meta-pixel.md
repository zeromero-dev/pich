# Meta Pixel, Consent Bar, CAPI Purchase and Catalog Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consent-gated Meta Pixel with four shop events, a server-side `Purchase` from the LiqPay webhook, a `/feed.xml` catalog feed and the domain-verification tag.

**Architecture:** A client `ConsentProvider` owns the visitor's choice (localStorage, 12 months) and only after «Прийняти» mounts the pixel loader; event helpers call `window.fbq` and are no-ops when it is absent. Checkout forwards the consent plus `_fbp`/`_fbc` (and the server adds user agent + IP) inside the existing signed LiqPay `info` payload, and the webhook posts `Purchase` to the Graph API after the CRM order exists. The feed is a route handler rendering RSS from the cached `getCatalog()`.

**Tech Stack:** Next.js 16.3 App Router (read `node_modules/next/dist/docs/` before Next-specific code: `02-components/script.md`, route handlers, metadata), React 19, TypeScript, zod, Node `crypto`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-meta-pixel-design.md`

## Global Constraints

- Nothing from Meta (script, cookie, request) before «Прийняти» or after «Відхилити»; unset `META_PIXEL_ID` ⇒ no bar, no pixel, no CAPI.
- `META_CAPI_TOKEN` is server-only; never imported from a `'use client'` file.
- Event ids are CRM product ids (`Product.id`), currency `UAH`, `content_type: 'product'`.
- Real `Purchase` only when the LiqPay callback `status === 'success'`; `status === 'sandbox'` sends with `test_event_code` = `META_TEST_EVENT_CODE`, or nothing if that is unset.
- A Meta failure never throws out of the webhook and never changes its response; log with prefix `[meta-capi]`.
- Feed never contains `net_price`; excludes products with empty description, no image, or price ≤ 0.
- Brand fallback: `Plai Pich`. Domain tag content: `urvu6kguqn4amjpv49pkl9ze3gi012`.
- Graph endpoint: `https://graph.facebook.com/v27.0/<PIXEL_ID>/events`.
- Decline and Accept buttons equal size and weight (Decline outlined/light, Accept dark), using existing `PillButton` if it fits.
- Components import `m` from `motion/react`, never `motion` (LazyMotion strict). Plain `<img>` only. Comments 2–3 lines max, constraints only (CLAUDE.md).
- UI copy in `lib/i18n.ts` (UA + EN). All new copy is ours → owner review list in CLAUDE.md.
- Before `npm run build`: `npx react-doctor@latest`, fix or record exceptions in `doctor.config.mjs`.

## Review Focus

1. Returning visitor who accepted: no bar flash on load, pixel loads once, exactly one `PageView` per route including the first page (no double from the base snippet + route effect) — Task 3 manual check.
2. Visitor who accepted, then declines via the footer link: no further events in the same tab — Task 2/3 (reload on revoke).
3. LiqPay calls the webhook twice for one payment: same `event_id` (the order id) both times so Meta dedups; no throw — Task 4 test.
4. Buyer leaves email empty (allowed by `contactSchema`): `em` omitted, never the hash of `''` — Task 4 test.
5. Description/title with `&`, `<`, quotes, Cyrillic, newlines; artist `null`; extra images — feed stays valid XML with fallback brand — Task 1 test.

---

### Task 1: Catalog feed `/feed.xml`

**Files:**
- Create: `lib/meta/feed.ts`, `lib/meta/feed.test.ts`, `app/feed.xml/route.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces: `buildFeed(products: Product[], origin: string): string` and `feedItemsOf(products: Product[]): Product[]` (the inclusion filter), both pure.

- [ ] **Step 1: Write `lib/meta/feed.test.ts`** in the style of `lib/artist-roster.test.ts` (plain `node:assert/strict`, top-level asserts). Build a `Product` factory; assert:
  - `feedItemsOf` drops products with `description` `null` / `''` / whitespace, with `images: []`, with `price <= 0`; keeps an out-of-stock product.
  - `buildFeed([p], 'https://www.pich.co.ua')` for `p = {id:'9527902', slug:'9527902', name:'Чашка «A & B» <1>', description:'Рядок 1\nРядок 2 & "лапки"', price:1200, inStock:true, artist:null, images:['https://crm.h-profit.com/a.jpg','https://crm.h-profit.com/b.jpg']}` contains:
    `<g:id>9527902</g:id>`, `<g:title>Чашка «A &amp; B» &lt;1&gt;</g:title>`, `&amp; &quot;лапки&quot;` (or `"`; either is valid — assert `&amp;`), `<g:price>1200.00 UAH</g:price>`, `<g:availability>in stock</g:availability>`, `<g:condition>new</g:condition>`, `<g:link>https://www.pich.co.ua/shop/9527902</g:link>`, `<g:image_link>https://crm.h-profit.com/a.jpg</g:image_link>`, `<additional_image_link>https://crm.h-profit.com/b.jpg</additional_image_link>`, `<g:brand>Plai Pich</g:brand>`; starts with `<?xml version="1.0" encoding="utf-8"?>`; declares `xmlns:g="http://base.google.com/ns/1.0"`.
  - Out-of-stock product renders `<g:availability>out of stock</g:availability>`; artist `'Михайло Діденко'` renders as brand.
  - Output has no `net_price` substring and no line longer than 5 000 000 chars.
- [ ] **Step 2: Update `package.json` `test`** to run both files: `npx --yes tsx@4.19.2 lib/artist-roster.test.ts && npx --yes tsx@4.19.2 lib/meta/feed.test.ts`. Run `npm test` → FAIL (module missing).
- [ ] **Step 3: Implement `lib/meta/feed.ts`.** RSS 2.0 per spec §4 (channel `title` «Plai Pich», `link` = origin, one field per line), XML-escape `& < > " '`, price `toFixed(2)`. No `server-only` import (the test runs under tsx).
- [ ] **Step 4: Run `npm test`** → PASS.
- [ ] **Step 5: Create `app/feed.xml/route.ts`**: `GET` returns `buildFeed(await getCatalog(), WEBSITE_URL)` with `Content-Type: application/xml; charset=utf-8`. Check route-handler caching in the Next 16 docs; `getCatalog()` is already cached, so a dynamic handler is fine.
- [ ] **Step 6: Verify** `npm run dev`, `curl -s localhost:3000/feed.xml | head -40` shows items; count `<item>` vs products with descriptions. Open one CRM `image_link` and record its format and pixel size in the task report (spec unknown; don't build a proxy).
- [ ] **Step 7: Commit** `feat(meta): catalog feed at /feed.xml`.

### Task 2: Consent state, bar and footer link

**Files:**
- Create: `lib/consent.ts`, `lib/consent.test.ts`, `components/consent.tsx`
- Modify: `app/layout.tsx`, `components/footer.tsx`, `lib/i18n.ts`, `package.json` (`test`)

**Interfaces:**
- Produces (`lib/consent.ts`, pure, no React):
  - `type ConsentChoice = 'granted' | 'denied'`
  - `const CONSENT_KEY = 'plai-pich-consent-v1'`, `const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000`
  - `parseConsent(raw: string | null, now: number): ConsentChoice | null` — `null` for missing, malformed, unknown value or older than max age.
  - `serializeConsent(choice: ConsentChoice, now: number): string` (JSON `{choice, at}`).
- Produces (`components/consent.tsx`, `'use client'`):
  - `ConsentProvider({ pixelId, children }: { pixelId: string | null; children: ReactNode })` — renders children, the bar, and (Task 3) the pixel loader when granted.
  - `useConsent(): { choice: ConsentChoice | null; ready: boolean; accept(): void; decline(): void; reopen(): void }` — `ready` is false until localStorage was read.

- [ ] **Step 1: Write `lib/consent.test.ts`**: round-trip `parseConsent(serializeConsent('granted', t), t)` === `'granted'`; `'denied'` likewise; `parseConsent(null, t)`, `parseConsent('garbage', t)`, `parseConsent('{"choice":"maybe","at":1}', t)` === `null`; expired: `parseConsent(serializeConsent('granted', 0), CONSENT_MAX_AGE_MS + 1)` === `null`; exactly at max age still valid.
- [ ] **Step 2: Add it to the `test` script; run `npm test`** → FAIL.
- [ ] **Step 3: Implement `lib/consent.ts`.**
- [ ] **Step 4: `npm test`** → PASS.
- [ ] **Step 5: Implement `components/consent.tsx`.** Read storage in an effect (try/catch like `components/providers.tsx`; storage failure ⇒ choice stays in memory for the tab). Bar renders only when `ready && choice === null && pixelId`: fixed bottom, full width, `bg-surface`, hairline top border, text left + «Детальніше» `Link` to `/privacy`, buttons right; stacked on narrow screens; must not cover the cart drawer's own controls (check z-index against `components/cart-drawer.tsx`). `decline()` after a previous `'granted'` calls `window.location.reload()` after writing storage, to unload the pixel. `reopen()` sets the in-memory choice to `null` so the bar shows again.
- [ ] **Step 6: i18n keys** in both dictionaries: `consent.text`, `consent.more`, `consent.accept`, `consent.decline`, `footer.cookieSettings`. Draft UA: «Ми використовуємо файли cookie Meta, щоб вимірювати рекламу й показувати її тим, хто вже був на сайті.» / «Детальніше» / «Прийняти» / «Відхилити» / «Налаштування cookie». EN equivalents.
- [ ] **Step 7: Wire up.** `app/layout.tsx`: inside `<Providers>`, wrap content in `<ConsentProvider pixelId={process.env.META_PIXEL_ID || null}>`. `components/footer.tsx`: a button styled like the legal links, next to the privacy link, calling `reopen()`; render it only when `pixelId` is set (expose via `useConsent` or a `enabled` flag — your call).
- [ ] **Step 8: Manual check** (`npm run dev`, with `META_PIXEL_ID` set): bar on first visit; Accept/Decline hide it and persist across reload; footer link brings it back; no bar flash on reload after choosing; UA/EN switch changes copy; phone width (375px) has no horizontal scroll. Unset `META_PIXEL_ID` ⇒ no bar, no footer link.
- [ ] **Step 9: Commit** `feat(consent): cookie bar and footer settings link`.

### Task 3: Pixel loader, browser events, domain tag

**Files:**
- Create: `lib/meta/pixel.ts`, `components/meta-pixel.tsx`
- Modify: `components/consent.tsx`, `components/shop/product-detail.tsx`, `components/product-card.tsx`, `components/checkout/checkout-view.tsx`, `app/layout.tsx`

**Interfaces:**
- Consumes: `useConsent`, `ConsentProvider` (Task 2).
- Produces (`lib/meta/pixel.ts`, client-safe, no env access):
  - `track(event: 'ViewContent' | 'AddToCart' | 'InitiateCheckout', params: Record<string, unknown>): void` — calls `window.fbq('track', …)` if `window.fbq` exists, else no-op.
  - `trackViewContent(product: Product): void`, `trackAddToCart(product: Product, qty: number): void`, `trackInitiateCheckout(items: CartItem[]): void` — build params per spec §2 table (`content_ids`, `contents: [{id, quantity}]`, `value`, `num_items`, `currency: 'UAH'`, `content_type: 'product'`).
  - `readMetaCookies(): { fbp?: string; fbc?: string }` — reads `_fbp` / `_fbc` from `document.cookie` (used by Task 4).
- Produces (`components/meta-pixel.tsx`): `MetaPixel({ pixelId }: { pixelId: string })` — injects the standard base code with `next/script` (`id`, `strategy="afterInteractive"`), `fbq('init', pixelId)` only (no `PageView` in the snippet), and fires `fbq('track','PageView')` in an effect keyed on `usePathname()` + search params, so the first page and every client navigation get exactly one.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md` (inline script rules in Next 16).
- [ ] **Step 2: Implement `lib/meta/pixel.ts` and `components/meta-pixel.tsx`;** `ConsentProvider` renders `<MetaPixel pixelId={pixelId} />` only when `choice === 'granted'`. Declare `window.fbq` type locally in `lib/meta/pixel.ts`.
- [ ] **Step 3: Events.** `product-detail.tsx`: `trackViewContent(product)` in an effect keyed on `product.id`; call `trackAddToCart` next to both `add(...)` calls (`product-card.tsx:22`, `product-detail.tsx:171`) — outside any state updater, with the qty actually added. `checkout-view.tsx`: `trackInitiateCheckout(items)` once, the first time `items.length > 0` after the cart loaded (ref guard).
- [ ] **Step 4: Domain tag.** `app/layout.tsx` static `metadata.other = { 'facebook-domain-verification': 'urvu6kguqn4amjpv49pkl9ze3gi012' }`.
- [ ] **Step 5: Manual check** with the Meta Pixel Helper Chrome extension: before consent no request to `facebook.com`/`connect.facebook.net` (DevTools Network) and no `_fbp` cookie; after Accept: one `PageView` per navigation (home → shop → product → back), `ViewContent` with the right id, `AddToCart` from card and product page with qty, `InitiateCheckout` once on `/checkout`. Reload after Decline-from-footer: no pixel requests.
- [ ] **Step 6: Verify the tag** after `npm run build && npm start`: `curl -s localhost:3000/ | grep -o '<head>.*facebook-domain-verification[^>]*>'` and the same with `-A 'facebookexternalhit/1.1'` — tag must be inside `<head>`.
- [ ] **Step 7: Commit** `feat(meta): consent-gated pixel, shop events, domain verification tag`.

### Task 4: `Purchase` via Conversions API

**Files:**
- Create: `lib/meta/capi.ts`, `lib/meta/capi.test.ts`
- Modify: `lib/checkout/schema.ts`, `lib/liqpay/types.ts`, `app/api/checkout/route.ts`, `components/checkout/checkout-view.tsx`, `app/api/checkout/liqpay-callback/route.ts`, `package.json` (`test`), `.env.example`

**Interfaces:**
- Consumes: `readMetaCookies()`, `useConsent()` (Tasks 2–3).
- Produces:
  - `checkoutRequestSchema` gains `meta: z.object({ fbp: z.string().max(200).optional(), fbc: z.string().max(500).optional() }).optional()` — present only when consent is granted.
  - `lib/liqpay/types.ts`: `type MetaMatch = { fbp?: string; fbc?: string; userAgent?: string; ip?: string }`; `CheckoutPayload` gains `meta?: MetaMatch` (presence = consent; absent in old payloads).
  - `lib/meta/capi.ts`:
    - `sha256(value: string): string` (hex), `normalizeEmail(email: string): string | null` (trim + lowercase, `null` if empty), `normalizePhone(phone: string): string | null` (digits only, `+380501234567` → `380501234567`).
    - `buildPurchaseEvent(input: { orderId: number; lines: LockedLine[]; contact: OrderContact; meta: MetaMatch; eventTime: number; sourceUrl: string }): object` — pure; shape per spec §3 (`event_id: String(orderId)`, `value` = Σ price·qty, `contents`, `content_ids`, `user_data` with `em`/`ph` as single-element hashed arrays only when non-null, `fbp`, `fbc`, `client_user_agent`, `client_ip_address` only when present).
    - `sendPurchase(event: object, opts: { testEventCode?: string }): Promise<void>` — reads `META_PIXEL_ID` / `META_CAPI_TOKEN`, returns silently if either is unset; POST JSON `{ data: [event], access_token, test_event_code? }` to the v27.0 endpoint with `AbortSignal.timeout(5000)`; logs `[meta-capi]` on non-2xx or error; never throws. Imports `server-only` only in this function's module if that doesn't break the tsx test — otherwise put `sendPurchase` in `lib/meta/capi-send.ts` with `import 'server-only'`.

- [ ] **Step 1: Write `lib/meta/capi.test.ts`:**
  - `normalizePhone('+380501234567') === '380501234567'`; `normalizeEmail('  A@B.UA ') === 'a@b.ua'`; `normalizeEmail('') === null`.
  - `sha256('a@b.ua')` equals the hex digest computed with `node:crypto` in the test.
  - `buildPurchaseEvent` for two lines (1200×1, 450×2), email `''`: `event_name === 'Purchase'`, `event_id === '1731400000000'` for that orderId, `action_source === 'website'`, `custom_data.value === 2100`, `currency === 'UAH'`, `content_ids` deep-equal both ids, `user_data.em === undefined`, `user_data.ph` deep-equals `[sha256('380501234567')]`, `client_user_agent` and `fbp` passed through; with `meta: {}` no `fbp`/`fbc` keys.
  - Same input built twice yields the same `event_id` (webhook retry dedup).
- [ ] **Step 2: Add to `test` script; `npm test`** → FAIL.
- [ ] **Step 3: Implement `lib/meta/capi.ts`.** `npm test` → PASS.
- [ ] **Step 4: Client → checkout.** `checkout-view.tsx` adds `meta: choice === 'granted' ? readMetaCookies() : undefined` to the POST body; schema accepts it.
- [ ] **Step 5: Checkout route.** When `parsed.meta` is present, put `meta: { ...parsed.meta, userAgent: request.headers.get('user-agent')?.slice(0, 400), ip: first entry of x-forwarded-for }` into `encodePayload({...})`; otherwise omit `meta`.
- [ ] **Step 6: Webhook.** After `await createRemoteOrder(...)` succeeds and `payload.meta` is present: if `callback.status === 'success'` → `sendPurchase(event, {})`; if `'sandbox'` and `META_TEST_EVENT_CODE` set → `sendPurchase(event, { testEventCode })`; else skip. `sourceUrl` = `${WEBSITE_URL}/checkout`, `eventTime` = `Math.floor(Date.now()/1000)`. Await it (serverless) inside the existing try; it cannot throw.
- [ ] **Step 7: `.env.example`** — comments on the three `META_*` keys (pixel id public value read by the server layout; token server-only; test code only for sandbox payments, rotates in Events Manager).
- [ ] **Step 8: Tunnel E2E** (`npx cloudflared tunnel --url http://localhost:3000`, `WEBSITE_URL`/`DEV_ORIGIN` = tunnel, `LIQPAY_SANDBOX=1`, fresh `META_TEST_EVENT_CODE`): Accept → buy in sandbox → Events Manager «Тестування подій» shows `Purchase` (server) with matching value and ids, plus the 4 browser events. Repeat with Decline → zero events, no `Purchase`. Record results in the task report.
- [ ] **Step 9: Commit** `feat(meta): Purchase via Conversions API from the LiqPay webhook`.

### Task 5: Privacy copy, docs, final verification

**Files:**
- Modify: `lib/info-pages.ts` (privacy «Файли cookie» and «Кому ми передаємо дані»), `CLAUDE.md`, `.claude/docs/domain/checkout.md`, `.claude/docs/domain/catalog.md`

- [ ] **Step 1: Privacy copy** per spec §6: cookie section names `_fbp`/`_fbc`, set only after «Прийняти», purpose, footer «Налаштування cookie» to change; recipients list adds Meta Platforms (hashed email/phone + order amount, for buyers who accepted). Keep the existing LiqPay cookie sentence.
- [ ] **Step 2: Docs.** CLAUDE.md: Meta section as fact (pixel, consent, CAPI, feed, env vars incl. Vercel), remove/replace the stale "171 of 258 descriptions are internal notes" claim with the 2026-11-12 check (65 live works, clean), add new copy to the owner-review list, note `WEBSITE_URL` apex suspicion as a pre-deploy check. `checkout.md`: `meta` in the payload and the CAPI step. `catalog.md`: the feed and its exclusion rule.
- [ ] **Step 3: Gates.** `npx react-doctor@latest` (fix or record), `npm run lint`, `npm test`, `npm run build` — all clean.
- [ ] **Step 4: Commit** `docs: Meta pixel, consent and feed`.

Deploy steps (Vercel env, `WEBSITE_URL` check with the user, domain verify, catalog creation by Ірина) stay in the spec's "Deploy steps" — not part of this plan's execution.

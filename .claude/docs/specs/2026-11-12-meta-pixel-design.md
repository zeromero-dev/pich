# Meta Pixel, consent bar, Conversions API and catalog feed — design

Date: 2026-11-12. Status: approved in conversation, not built.

## Why

Ірина (runs Plai Pich's ads on Facebook/Instagram) asked for three things, in her order:
connect the Meta Pixel, add events, then integrate the catalog "via a feed or meta tags,
whichever is better". The goal is measurable shop sales from ads, retargeting of site
visitors, and dynamic product ads built from the catalog. Only shop sales matter for now.

## Goals

1. A cookie consent bar; nothing from Meta loads or is sent before the visitor accepts.
2. Meta Pixel in the browser after consent, with four standard events.
3. `Purchase` sent server-side via the Conversions API (CAPI) from the LiqPay webhook,
   only for buyers who consented.
4. A product feed at `/feed.xml` that Ірина connects to a Meta catalog in Commerce Manager.
5. The `facebook-domain-verification` meta tag so `pich.co.ua` can be verified.
6. The privacy page tells the truth about the above.

## Non-goals

- No events for search, collaboration page, Instagram link, event pages.
- No consent categories / toggles screen — Meta is the only thing needing consent.
- No Meta-hosted "Conversions API with Meta integration", no CAPI Gateway, no partner integration.
- No metatag-based catalog (the existing Product JSON-LD stays as it is, for Google).
- No Google Merchant Center setup (the feed format just happens to be compatible).

## Anti-goals (failure even if it "works")

- Any Meta request, script or cookie before «Прийняти», or after «Відхилити».
- A `Purchase` for a visitor who declined, or a sandbox payment counted as a real sale.
- A Meta/CAPI failure that delays, fails or blocks creating the CRM order.
- The CAPI token reaching the browser (it is server-only, like `HUGEPROFIT_API_KEY`).
- `net_price` or any other cost data in the feed (see CLAUDE.md gotcha).
- Decline styled weaker than Accept (EU "dark pattern").

## Account state (done in Meta, 2026-11-12)

- Pixel / dataset «Мистецька крамничка Піч», ID `1142689438442400`, in the "Plai Business Manager"
  portfolio. That portfolio also holds other projects' pixels — never touch them.
- `.env.local` already holds `META_PIXEL_ID`, `META_CAPI_TOKEN` (direct integration with the
  Dataset Quality API, scoped to our pixel only), `META_TEST_EVENT_CODE`. `.env.example` already
  lists the three keys (empty). The test code rotates in Events Manager; refresh it before testing.
- Domain `pich.co.ua` added, **Not Verified**; tag content `urvu6kguqn4amjpv49pkl9ze3gi012`.
- No Commerce catalog exists yet; create it after the feed is live in production.

## Design

### 1. Consent bar

- Full-width strip fixed to the bottom edge, white, hairline top border, site tokens
  (`app/globals.css`). Left: one sentence that the site uses Meta cookies for advertising, with a
  «Детальніше» link to `/privacy`. Right: «Відхилити» and «Прийняти», both real pill buttons
  (Decline light/outlined, Accept dark — equal size and weight). On phones the text stacks
  above the buttons. Mockup: option A in `.superpowers/brainstorm/` (picked by the user).
- Copy in `lib/i18n.ts`, UA + EN, follows the current locale.
- Shows on first visit on any page; does not block the page; disappears on either click.
- The choice is stored in the visitor's browser (localStorage, wrapped in try/catch like the
  cart). The CAPI needs it server-side only through the checkout request (below), so no cookie
  of our own is required. Choice lives 12 months, then the bar asks again (builder's call how).
- A «Налаштування cookie» link in the footer (next to the privacy link) shows the bar again.
  Switching from accepted to declined must stop further events; a page reload is acceptable
  to fully unload the pixel (builder's call).
- Must render nothing during SSR / before the stored choice is read (no flash for returning
  visitors), and must not cause layout shift.

### 2. Pixel and browser events

- Pixel ID from `META_PIXEL_ID` (public value; the builder decides how it reaches the client,
  e.g. `NEXT_PUBLIC_` copy or a prop from the server layout). Unset ID ⇒ no pixel, no bar.
  Preview and local runs can simply leave it unset.
- Load the standard `fbevents.js` only after consent. Use Next's Script component or an
  equivalent; read `node_modules/next/dist/docs/` first (Next 16).
- Events (all values in `UAH`, ids are CRM product ids = `Product.id`, `content_type: 'product'`):

| Event | When | Data |
|---|---|---|
| `PageView` | every page, including client-side navigations | — |
| `ViewContent` | product page opens | `content_ids: [id]`, `value: price` |
| `AddToCart` | a work is added to the cart (`add()` callers: `components/product-card.tsx`, `components/shop/product-detail.tsx`) | `content_ids`, `contents: [{id, quantity}]`, `value` |
| `InitiateCheckout` | `/checkout` opens with a non-empty cart | all ids, `contents`, `num_items`, `value: subtotal` |

- Do not fire inside a React state updater (`add()` uses one) — fire from the caller or an effect.
- No browser `Purchase` — the server sends it.

### 3. `Purchase` via Conversions API

- Checkout (`app/api/checkout/route.ts`) receives, from the form, the consent flag and the
  `_fbp` / `_fbc` cookie values (only when consented). These go into the signed payload
  (`CheckoutPayload` in `lib/liqpay/types.ts`, encoded by `lib/liqpay/payload.ts`) that travels
  in LiqPay `info`. Keep it small: the 510-char cap is on `server_url`, not `info`, but don't
  bloat it. Old payloads without these fields must still decode (payments in flight at deploy).
- `app/api/checkout/liqpay-callback/route.ts`: after `createRemoteOrder` succeeds, if the payload
  says consented, POST one `Purchase` to `https://graph.facebook.com/v<current>/<PIXEL_ID>/events`
  with `META_CAPI_TOKEN`:
  - `event_name: 'Purchase'`, `event_time` = now, `action_source: 'website'`,
    `event_source_url` = the site's checkout URL, `event_id` = the LiqPay order id
    (Meta dedups repeat webhooks with the same event_id).
  - `user_data`: SHA-256 of normalised email and phone (from `contact`), `fbp`, `fbc`, plus
    `client_user_agent` and `client_ip_address` captured by `/api/checkout` from the buyer's
    request (Meta requires the user agent for `action_source: 'website'`; added during planning).
  - `custom_data`: `currency: 'UAH'`, `value` = amount charged, `content_ids`, `contents`,
    `content_type: 'product'`.
  - Sandbox gate is per payment, not per env var: when the callback `status === 'sandbox'`, send
    with `test_event_code` = `META_TEST_EVENT_CODE`, and **skip entirely if that code is unset**.
    Only `status === 'success'` sends a real `Purchase`. (Our call: production may still run
    `LIQPAY_SANDBOX=1` until the LiqPay live cutover, and those payments must never count as sales.)
- Only after the CRM order exists — a paid-but-sold-out payment (no order, manual refund) is
  not a sale. (Our call.)
- Failure handling: catch everything, log `[meta-capi] …` with order id, never throw, never
  change the webhook's response. A missing token/pixel id ⇒ skip silently.

### 4. Catalog feed

- Route: `/feed.xml`, built from `getCatalog()` (the 5-min cached list) — no extra CRM calls.
- Format: RSS 2.0 with `xmlns:g="http://base.google.com/ns/1.0"` (example in Meta's catalog
  reference). Proper XML escaping; one field per line (Meta caps a single line at 5 MB).
- Per item (Meta "Supported Fields for Products"):
  - `g:id` = `Product.id` (must equal pixel `content_ids`)
  - `g:title` = name (Meta recommends ≤ 65 chars, hard cap 200)
  - `g:description` = CRM description verbatim, plain text. Checked 2026-11-12: all 65 works on
    the live site (= what `getCatalog()` returns in production, so exactly what the feed will hold)
    were fetched and scanned for IBANs, card numbers, phones, «ФОП», «ІПН», «рахунок», «закуп»:
    zero hits, all marketing copy. The owners cleaned the field since 2026-08-12. The rule stays
    the owners' (CLAUDE.md: anything typed there is published) — the feed adds Meta as one more
    place it is published; no sanitiser.
  - `g:availability` = `in stock` / `out of stock` (sold works stay; Meta hides them from ads)
  - `g:condition` = `new`
  - `g:price` = `1200.00 UAH`
  - `g:link` = `${WEBSITE_URL}/shop/${slug}`
  - `g:image_link` = first image; `additional_image_link` = the rest (if any)
  - `g:brand` = artist name, or «Plai Pich» when `artist` is null (our call)
- **Excluded:** products with an empty description (Meta: "products may not upload" without
  `id, title, description, availability, condition, price, link, image_link` + one of
  `brand/gtin/mpn`). Also anything without an image or price. Today: 3 of 65 live works lack a
  description; they appear automatically once one is written in Hugeprofit.
- `google_product_category` / `fb_product_category` are marked "Required" by Meta but do not
  block upload — skip for now.
- Unknown: whether CRM images (`crm.h-profit.com/bimages/get/...`) are JPEG/PNG ≥ 500×500 —
  check a sample; if not, note it, don't build an image proxy without asking.

### 5. Domain verification tag

- `<meta name="facebook-domain-verification" content="urvu6kguqn4amjpv49pkl9ze3gi012">` on every
  page via root `metadata.other` in `app/layout.tsx` (hardcoded — not secret).
- Must be in the raw HTML `<head>`, not streamed into `<body>`: Meta says verification fails
  otherwise. Verify with `curl` (also with `User-Agent: facebookexternalhit/1.1`) after build.
- Meta will fetch `http://pich.co.ua/`, which 308-redirects to `https://www.pich.co.ua`.
  If verification fails because of that, the fallback is a DNS TXT record (owner of the domain).

### 6. Privacy page

- Rewrite the «Файли cookie» section in `lib/info-pages.ts` (currently says the site uses no
  advertising cookies — false after this). State: Meta Pixel cookies (`_fbp`, `_fbc`), set only
  after «Прийняти», purpose (ad measurement and retargeting), how to change the choice (footer link).
- «Кому ми передаємо дані»: add Meta Platforms — for buyers who accepted cookies, hashed email
  and phone with the order amount, for ad measurement.
- All new copy is ours, not the owners' — add it to the "UI labels need owner review" list in
  CLAUDE.md.

## Testing

- Local: bar behaviour, pixel events via the Meta Pixel Helper Chrome extension, `/feed.xml` content.
- Tunnel (`npx cloudflared tunnel --url http://localhost:3000`, `WEBSITE_URL` + `DEV_ORIGIN` set to it,
  `LIQPAY_SANDBOX=1`): full run accept → product → cart → checkout → sandbox payment; Events Manager
  «Тестування подій» shows the 4 browser events and the server `Purchase`. Repeat with «Відхилити»:
  zero events, including `Purchase`.
- Browser test events are recorded as real (no test code for the browser); acceptable before ads run.
- Don't connect the Meta catalog to a local or tunnel feed (dev warehouse 51630 = mock products,
  links on the tunnel domain). Connect only `https://www.pich.co.ua/feed.xml` after deploy.
- Keep `npm test` style: one small assert-based check for the pure parts (feed item mapping and
  exclusion, CAPI payload building / hashing normalisation).

## Deploy steps (after merge)

1. Vercel Production: `META_PIXEL_ID`, `META_CAPI_TOKEN`; `META_TEST_EVENT_CODE` optional (only
   used for sandbox payments; unset ⇒ sandbox payments send nothing).
2. Check `WEBSITE_URL` in Vercel Production. The live sitemap emits `https://pich.co.ua/...`
   (apex, which 308-redirects) — per the CLAUDE.md gotcha that breaks the LiqPay webhook in live
   mode and would put redirecting links in the feed. Expected `https://www.pich.co.ua`. **Pre-existing,
   not caused by this work; confirm with the user before changing.**
3. Ірина: click «Підтвердити домен»; create catalog (online products) → data feed by schedule →
   `https://www.pich.co.ua/feed.xml`, daily → link the pixel.
4. Update CLAUDE.md (facts, env vars, the stale "171 of 258 descriptions are internal notes" line)
   and `.claude/docs/domain/` (catalog / checkout) per project rules.

## Left to the builder

File layout, component split, how the pixel id reaches the client, the consent storage shape and
12-month expiry mechanism, the Graph API version (use current), the normalisation details for
email/phone hashing per Meta's CAPI docs, and the exact copy of the bar (draft, owners review).

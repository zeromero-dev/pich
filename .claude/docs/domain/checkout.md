# Ordering (Checkout)

Turning a cart draft into an order in the CRM. The CRM is the order system of record; this app owns the *process*: validation → payment (LiqPay) → order creation.

**Current state: built and paid.** `app/api/checkout/route.ts` validates against fresh CRM data and returns a signed LiqPay checkout request; the browser redirects to LiqPay to pay; LiqPay's webhook (`app/api/checkout/liqpay-callback/route.ts`) verifies the signature and only then creates the CRM order, with `info.is_paid: true`. No order is created by the initial request — see "The flow" below.

**Verified against the live CRM 2026-08-13** — this predates the LiqPay integration; the order below was created the old, unpaid way (`info.is_paid: false`) by the synchronous flow this doc used to describe. Kept because it's still real evidence the CRM order-creation call itself works — one test order (`order_id` 1786609352566, CRM id 266591108). What the CRM did with it:

- Stored every field as sent — `status: "pending"`, `info.is_paid: false`, `currency: "UAH"`, the `address_1` object, and `order_data[].local_product_id` with `product_id: null`.
- **Reserved the stock itself**, adding `is_reserved: true`, `reserved_pids` and `mid: "34998"` to the line. The reservation warehouse comes from the token's integration settings, not from us.
- **Auto-created a client record** (id 2980993) carrying first/last name, phone, email, city and address. Contact details land in the CRM's Клієнти section without us calling `POST /bapi/clients`.
- **Did not create a sale.** The sales ledger stayed at 9 rows, so web orders never touch the cash accounts the owners' walk-in sales post to.
- Returned `order_id` as a *string* even though we send an int, and assigned `integration_id: 12452`.

Deleting that order in the CRM UI (there is no DELETE endpoint for remote orders) **released the reservation** — `instock` went back to 29 — but **left the auto-created client record in place**. So every web order permanently adds a row to Клієнти, and cancelling an order does not clean it up. Whether the CRM de-duplicates a returning buyer by phone or email is untested.

**Verified locally against the live CRM 2026-09-07**, with a webhook callback minted outside LiqPay (same HMAC payload tag and same `sign()` construction, both keyed on the `LIQPAY_PRIVATE_KEY` the app itself reads — no LiqPay account involved): against the real shop (warehouse 34998, `LIQPAY_SANDBOX=1`), `createRemoteOrder`'s guard fired and refused to create the order, logging `CrmError: refusing to create order … in the real shop while LIQPAY_SANDBOX=1`; `GET /bapi/remote_orders` stayed empty. With `CRM_WAREHOUSE_ID=51630`, the same callback shape created the account's first-ever `remote_orders` record (mock product 9054727), matching every field this doc documents above — except `instock` did **not** decrease and the response's `reservedProducts` was empty. Confirmed: mock product 9054727 has exactly one stock row, `mid: 51630`, and none in warehouse 34998. That hypothesis — reservation targets a warehouse fixed by the integration config rather than the product's own — was **confirmed on 2026-09-08** by the paid order below, which reserved into 51630 once the token's reservation warehouse pointed there. Separately, re-POSTing the same `order_id` did not error — it silently overwrote the existing order in place (same CRM row id, `phone`/`email`/`last_name` wiped by the second payload's omissions) rather than rejecting or duplicating, so `order_id` gives upsert behavior, not a guard, and a LiqPay redelivery must not be assumed harmless.

**Verified end to end through LiqPay's sandbox 2026-09-08**, paying a mock work with a test card over a public tunnel: LiqPay's own webhook reached `server_url`, the handler logged nothing (every line in it is an error path), and the CRM order landed complete — 340 UAH, `info.is_paid: true`, `order_text: "LiqPay order_id …"`, contact fields intact. Two things this settled that the local mint could not:

**Not yet verified: qty > 1.** Multi-unit lines (built 2026-10-25) have not been rehearsed against the CRM — whether `remote_orders` reserves N units for `quantity: N` is unknown. The 2026-10-25 attempt stopped at setup: the token no longer reads the dev warehouse 51630 (`scripts/crm-scope.mjs` lists only 34998). Don't ship qty > 1 to production until a sandbox run confirms `instock` drops by N.

- **Reservation does work, into the warehouse the integration settings name.** This order came back `is_reserved: true`, `reserved_pids: [9060539]`, `mid: "51630"`, and the work moved `instock 1 → 0` with `quantity` still 1. The 2026-09-07 no-reservation result above was not a missing feature: the token in use then reserved into 34998, where that mock product had no stock row. Once the token was re-scoped to the dev warehouse, reservation targeted 51630 and fired. So the rule stands as originally written — the caveat is only that reservation goes to the *configured* warehouse, not to the product's own.
- **`result_url` is a GET.** LiqPay redirected the browser back with `GET /checkout/result?paymentId=…` (200), so the page route answers it fine. The long-standing worry that LiqPay POSTs there, which would 405 against a Next page, did not materialise for this flow.

## Model

```
OrderRequest {                        // what the client submits
  items: { workId, qty }[]            // ids only — never prices
  contact: { firstName, lastName, phone, email? }   // server joins first + last into the order's `name`
  delivery: pickup | branch/locker { settlementRef, warehouseRef }
          | courier { settlementRef, settlementName, streetRef, streetName, house, flat? }
  locale                              // for any customer-facing messaging
}
Order {                               // what we create in the CRM
  order_id      generated by us — no DB, so UUID or timestamp-based; must be unique, we are the only writer
  lines         re-derived server-side from fresh CRM data
  total         Σ line totals, computed server-side
  status        "pending" initially (CRM default)
}
```

## Business rules

1. **The client sends intent, not facts.** Only work ids and quantities cross the boundary. Prices, names, and totals are re-derived from fresh CRM data server-side. A price mismatch between what the buyer saw and current CRM data is a *decision point* (reject vs honor), not something to silently absorb — see open decisions.
2. **Stock validation is checkout-time truth.** Each line's `qty` must be ≤ the work's fresh `available` ([catalog.md](catalog.md) rule 1); shortfalls return `409 insufficient` with per-line counts. The webhook re-checks `available >= qty` before creating the order. Displayed stock was advisory; this check is authoritative. Re-fetch is one uncached call per line — `getFreshProduct()` — because `product_id` takes a single id only.
3. **Payment precedes order creation.** Decided 2026-08-12, built 2026-08-16 (LiqPay): `/api/checkout` validates and returns a signed LiqPay request but creates nothing; the CRM order is only created in the `liqpay-callback` webhook, after LiqPay's signature is verified and the payload's `paymentId` is confirmed to match the paid `order_id`. The order goes to the CRM with `info.is_paid: true`, `payment_type: "LiqPay"` and `status: "pending"`. The CRM reserves the stock on creation, into the warehouse named in the integration settings — confirmed working 2026-09-08, and confirmed to no-op for a product with no stock row in that particular warehouse (see the notes above).

   This makes the paid-but-order-creation-failed state real: a buyer can be charged by LiqPay while `createRemoteOrder` then fails (CRM down, stock sold out in the interim, etc). That case must be loud, never swallowed — the webhook logs it with `console.error` and enough context (order id, product ids) for a human to reconcile manually; there is no automated refund path.
4. **One contract, two parsers.** `lib/checkout/schema.ts` (zod) is parsed by the form for field errors and by `/api/checkout` as the authority; issue messages are `t.checkout` keys, so the schema stays locale-free. UX: a field's error shows after its first blur, then tracks every change ("reward early, punish late"); an invalid submit focuses the first bad field. Rules: first and last name are separate required fields (Nova Poshta needs both); the first name is one word, since `/api/checkout` joins them into the order's `name` and `splitName` takes the first word as `first_name` — so the payload shape did not change (2026-11-05); email is optional (format-checked when given); phone must be Ukrainian (`0XX…`, `380XX…`, `+38 (0XX) …`) and is normalised to `+380XXXXXXXXX`.
5. **Delivery is picked, never typed** (built 2026-10-29). Four methods: pickup at the shop, Nova Poshta branch, parcel locker, courier. Towns, branches/lockers and streets come from NP lookups (`lib/nova-poshta/`, proxied to the browser by `app/api/nova-poshta/*`), and the form only submits NP refs. `/api/checkout` re-resolves them against NP uncached (`lib/checkout/delivery.ts`): the warehouse must exist, be `Working`, be the chosen kind (`Branch` vs `Postomat`) and sit in the chosen town; a courier street must belong to the town and the town must allow address delivery. The address text sent to the CRM is NP's, not the buyer's. A bad selection is `400 delivery`; NP down is `503 delivery_unavailable` — both before payment.

## The flow (`app/api/checkout/route.ts` + `app/api/checkout/liqpay-callback/route.ts` — BUILT)

```
1. POST /api/checkout receives { items: [{workId, qty, price}], contact, delivery }  — price is for comparison only
2. Parse with checkoutRequestSchema (rule 4): qty 1–99 integers, no duplicate work ids, ≤20 items, contact rules
2b. resolveDelivery() against live Nova Poshta (rule 5) — 400 "delivery" / 503 "delivery_unavailable"
3. getFreshProduct() per line — uncached, one call each (product_id takes a single id)
4. Reject 409 "unavailable" if any work is missing or sold
4b. Reject 409 "insufficient" { short: [{workId, available}] } if any qty > fresh available
5. Reject 409 "repriced" if any CRM price != the price the buyer saw, echoing was/now
6. Compute the total server-side from fresh data; encode { paymentId, lines, contact } into
   the payment's `info` (not the server_url query: LiqPay caps server_url at 510 chars, and
   a one-item Cyrillic order overflowed it — 2026-11-05)
7. 200 { checkoutUrl, data, signature } → browser redirects to LiqPay to pay
8. LiqPay POSTs the result to app/api/checkout/liqpay-callback, which verifies the
   signature, decodes the payload from the signed `info`, confirms payload.paymentId === the paid order_id,
   re-checks available >= qty per line, then POST /bapi/remote_orders with info.is_paid: true
9. Buyer lands on /checkout/result, which calls LiqPay's status API and shows a status
   message (no live order number); cart is cleared client-side on confirmed payment
```

`lib/hugeprofit/orders.ts` owns the CRM payload; `crmPost()` in `client.ts` is `no-store` and **never retries** — a retry could double-create an order.

### Payment — LiqPay, built

`lib/liqpay/client.ts` — signs/verifies LiqPay requests (`sign`/`verifyCallback`, SHA1 of `privateKey + data + privateKey`, per LiqPay's published algorithm), builds the checkout request (`buildCheckoutRequest`), and does a read-only post-payment status lookup (`checkStatus`, used only for the buyer-facing result page, never to create an order).

`lib/liqpay/payload.ts` — base64url-encodes `{ paymentId, lines, contact }` into the payment's `info`, which LiqPay echoes inside its signed callback `data` (the old `server_url?payload=` carrier is still read as a fallback for payments started before 2026-11-05), since there is no database to hold cart state between the redirect and the webhook. `lib/liqpay/types.ts` defines the shapes; `paymentId` binds the payload to the order LiqPay's signature attests was paid, checked in the webhook before any order is created.

`app/api/checkout/liqpay-callback/route.ts` is the only place a CRM order is created for a paid checkout.

### CRM mapping — `POST /bapi/remote_orders` (from the API docs; not yet exercised live)

The whole body goes **inside a `data` wrapper**: `{ "data": { … } }`.

| CRM field | Source | Notes |
|-----------|--------|-------|
| `order_id` | generated by us | required; documented as `int`, so **not a UUID** — use a timestamp-based integer. The account has zero remote orders today, so we are the only writer. |
| `price`, `currency` | server-computed total, `"UAH"` | required |
| `first_name`, `last_name` | split from the single `name` field | first word / rest — crude but adequate; `first_name` required |
| `phone`, `email` | contact | optional in CRM; `phone` required by our rule 4, `email` optional since 2026-11-05 and omitted from the payload when blank — **an order without email is not yet verified against the live CRM** |
| `address_1` | `RemoteAddressType` | object: `{ address_1, city, delivery_cost }` all required, plus optional `ttn` and `delivery_operator` (`nova_poshta` \| `ukrposhta`). **`delivery_cost` is always `0`** — decided 2026-08-12; the site does not price delivery, the owners arrange it with the buyer. `city`/`address_1` carry NP's own text (e.g. «Відділення №1: вул. Якова Шепеля, 1», «Курʼєр: вул. Сковороди, 25, кв. 3», «Самовивіз: …»); `delivery_operator: "nova_poshta"` is sent for the three NP methods — from the API docs, **not yet seen on a live order**. |
| `order_data[]` | per line: `local_product_id`, `sku`, `name`, `quantity`, `price`, `total` | from fresh CRM data, not the cart. Use **`local_product_id`** (the HugeProfit product id) and leave `product_id: null` — `product_id` means the *marketplace* remote id, and the docs explicitly recommend `local_product_id` for products that live in HugeProfit, which ours do. |
| `status` | omit → `"pending"` | decided 2026-08-12: **always leave it `"pending"`**. Payment is signalled through `info.is_paid`, not the status — the owners drive the status themselves in the CRM. (Other documented values, unused by us: `processing`, `saled`, `cancelled`, `delivering`, `delivered`, `received`, `refund`, `arrived`.) |
| `info` | `InfoType` | `{ is_paid: true, payment_type: "<provider>", order_text?: … }` — `is_paid` is `true` by construction, since payment precedes order creation (rule 3). Carries the payment reference so the owners can match money to order. |

Response includes `reservedProducts` (`[[product_id, marketplace_id]]`) — the CRM reserves stock on order creation, into a warehouse chosen in the HugeProfit integration settings. Confirmed 2026-09-08: a real LiqPay payment returned `is_reserved: true`, `reserved_pids` and `mid` naming the reservation warehouse, and moved `instock` without touching `quantity`. Confirmed 2026-09-07: a product with **no** stock row in that warehouse gets no reservation and an empty `reservedProducts` instead. The API docs' integration-settings page is where the warehouse is chosen — "select the warehouse to which the goods will be reserved upon receipt of a new order" — so re-scoping a token can change which warehouse reservations land in.

### Settings that live in the CRM, not in our code

The API token is bound in the HugeProfit UI to a sales channel and to the warehouses it may touch, including the reservation warehouse. Sales-channel tagging is therefore an owner setup step, never a request field.

**No sales channel — decided 2026-08-12.** The live account defines none, and a channel is only a reporting label ("shop vs. walk-in") inside HugeProfit's own reports. Orders arrive untagged and everything works. Revisit only if the owners ask to split website sales out in their reporting.

**Verified end to end again 2026-11-05**, sandbox payment over a tunnel with the order carried in `info`: locker order `1793895731982` landed complete — `is_paid: true`, NP's locker text in `address_1`, and `delivery_operator: "nova_poshta"` accepted (the CRM added its own `clients_delivery` id), stock reserved in 51630. An order with a blank email has **not** been sent yet.

## Open decisions

- **Nova Poshta key and limits.** The lookups we call answered with an empty `apiKey` on 2026-10-29; that is observed, not documented. `NOVA_POSHTA_API_KEY` is sent when set — get one from the owners' NP cabinet before launch. NP's rate limits are undocumented; the lookup routes are public and cached at the CDN (success only, 1 day), which is the only brake.
- **Lockers vs. artwork size.** Parcel lockers have per-cell size limits; the form warns that a large work may not fit, but nothing checks dimensions.

- **`WEBSITE_URL` must be the exact origin.** `server_url` is built from it; a trailing slash or the apex `pich.co.ua` makes the callback answer 308, LiqPay doesn't get through, and the paid order is never created (seen 2026-11-05 with a trailing slash). See CLAUDE.md "LiqPay webhook URL is unforgiving".

- **No rate limiting.** `/api/checkout` is public, unauthenticated, and writes to the owners' CRM while reserving stock. With no database there is nowhere to keep a counter, so a script could flood the CRM with junk orders and lock up inventory. Shape validation and the 20-item cap are the only brakes today. Worth solving before the shop is publicised.
- **Duplicate submits are not deduplicated, and worse than a second order:** confirmed 2026-09-07 that re-POSTing an existing `order_id` does not create a second order — it silently overwrites the first in place, blanking any field the new payload omits (see 2026-09-07 note above). A double-click or a LiqPay webhook redelivery could corrupt an already-placed order's contact info instead of just double-booking it. No fix without storage to detect the repeat.

Resolved 2026-08-12: fetch fresh per work at validation (`getFreshProduct()`); `order_id` is an integer, not a UUID; `delivery_cost` is always 0; status stays `"pending"` with `info.is_paid` carrying payment; no sales channel.
Resolved 2026-08-16: payment provider is LiqPay — decided and built.

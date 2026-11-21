# Ordering (Checkout)

Checkout validates the cart, collects payment through plata by mono, then creates the paid order in HugeProfit.

**Current implementation:** `app/api/checkout/route.ts` validates against fresh CRM data and creates a Mono invoice. The buyer pays on Mono's hosted page. The signed webhook in `app/api/checkout/mono-callback/route.ts` verifies the payment and creates the CRM order with `info.is_paid: true`. The [production cutover plan](../plans/2026-11-18-plata-by-mono-cutover.md) covers activation and the first live smoke test. Dated LiqPay rehearsals below record earlier CRM behaviour.

## CRM and payment rehearsals

**Verified against the live CRM 2026-08-13** — this predates the LiqPay integration; the order below was created the old, unpaid way (`info.is_paid: false`) by the synchronous flow this doc used to describe. Kept because it's still real evidence the CRM order-creation call itself works — one test order (`order_id` 1786609352566, CRM id 266591108). What the CRM did with it:

- Stored every field as sent — `status: "pending"`, `info.is_paid: false`, `currency: "UAH"`, the `address_1` object, and `order_data[].local_product_id` with `product_id: null`.
- **Reserved the stock itself**, adding `is_reserved: true`, `reserved_pids` and `mid: "34998"` to the line. The reservation warehouse comes from the token's integration settings, not from us.
- **Auto-created a client record** (id 2980993) carrying first/last name, phone, email, city and address. Contact details land in the CRM's Клієнти section without us calling `POST /bapi/clients`.
- **Did not create a sale.** The sales ledger stayed at 9 rows, so web orders never touch the cash accounts the owners' walk-in sales post to.
- Returned `order_id` as a *string* even though we send an int, and assigned `integration_id: 12452`.

Deleting that order in the CRM UI (there is no DELETE endpoint for remote orders) **released the reservation** — `instock` went back to 29 — but **left the auto-created client record in place**. So every web order permanently adds a row to Клієнти, and cancelling an order does not clean it up. Whether the CRM de-duplicates a returning buyer by phone or email is untested.

**Verified locally against the live CRM 2026-09-07**, with a webhook callback minted outside LiqPay (same HMAC payload tag and same `sign()` construction, both keyed on the `LIQPAY_PRIVATE_KEY` the app itself reads — no LiqPay account involved): against the real shop (warehouse 34998, `LIQPAY_SANDBOX=1`), `createRemoteOrder`'s guard fired and refused to create the order, logging `CrmError: refusing to create order … in the real shop while LIQPAY_SANDBOX=1`; `GET /bapi/remote_orders` stayed empty. With `CRM_WAREHOUSE_ID=51630`, the same callback shape created the account's first-ever `remote_orders` record (mock product 9054727), matching every field this doc documents above — except `instock` did **not** decrease and the response's `reservedProducts` was empty. Confirmed: mock product 9054727 has exactly one stock row, `mid: 51630`, and none in warehouse 34998. That hypothesis — reservation targets a warehouse fixed by the integration config rather than the product's own — was **confirmed on 2026-09-08** by the paid order below, which reserved into 51630 once the token's reservation warehouse pointed there. Separately, re-POSTing the same `order_id` did not error — it silently overwrote the existing order in place (same CRM row id, `phone`/`email`/`last_name` wiped by the second payload's omissions) rather than rejecting or duplicating, so `order_id` gives upsert behavior, not a guard, and a LiqPay redelivery must not be assumed harmless.

**Verified end to end through LiqPay's sandbox 2026-09-08.** A test card payment for a mock work created a paid CRM order for ₴340 with the invoice note and contact fields. CRM reserved it in the integration's warehouse 51630, reducing `instock` from 1 to 0 with `quantity` unchanged. LiqPay returned the buyer using `GET /checkout/result?paymentId=…`.

**Verified locally through mono's test API 2026-11-19** (test token, tunnel, dev warehouse 51630, integration 13585, mock work 9526187 at ₴19.99):

1. **Happy path, qty 3:** order `price 59.97`, line `quantity 3`, `is_paid`, `is_reserved`, `mid "51630"`, `order_text "mono invoice <id>"`, `order_id` = the 15-digit reference; `instock 5 → 2`. **qty > 1 reserves N units** — settled. Success webhook 2.5 s.
2. **Duplicate:** two exact replays → 200, still one order, stock unchanged. Tampered body → 503 inside the pubkey cooldown (by design; 5 min then, 10 s since the Codex review).
3. **Adverse:** paid → refunded via `invoice/cancel` → replay → `reconcile` "status reversed", no order. Paid with the last unit already reserved → replay → `reconcile` "paid but sold out", no order.
4. **Retries:** mono makes 3 attempts within ~1 min, stops after the third 503. A 503 then a healthy retry created the order with no help. With all 3 failing, the report listed "paid, no CRM order"; a refunded invoice with no order is (correctly) not listed.
5. **Result page:** unpaid → pending + refresh; paid → «Дякуємо!»; refunded → «Оплату повернуто»; no cookie / another invoice's cookie → unknown (before the Codex review; now, with a valid `t`, such a cookie is ignored and the statement/CRM path runs).

Not verified: converting an order to a sale (HugeProfit's «Підтвердити замовлення» posts to a real cash account) — so whether `sales_id` fills on conversion is open; see the cutover plan. One success webhook took **22.6 s** (CRM stall, not reproduced; reads were 0.2–1.1 s) — within `maxDuration = 30`, and a cut-off run is safe because mono retries and the lookup finds an order already written.

## Model

```
OrderRequest {                        // what the client submits
  items: { workId, qty, price }[]     // displayed price for comparison
  contact: { firstName, lastName, phone, email }   // email may be empty
  delivery: pickup | branch/locker { settlementRef, warehouseRef }
          | courier { settlementRef, settlementName, streetRef, streetName, house, flat? }
}
Order {                               // what we create in the CRM
  order_id      random 15-digit string shared with the Mono invoice reference
  lines         validated against fresh CRM stock, with unit prices locked at invoice creation
  total         Σ line totals in integer kopecks
  status        "pending" initially (CRM default)
}
```

## Business rules

1. **The server sets the payable amount.** Checkout compares the displayed unit prices with fresh CRM prices. A mismatch returns `409 repriced` before creating an invoice. Unit prices and the total are locked in kopecks for the payment attempt.
2. **Stock validation is checkout-time truth.** Each line's `qty` must be ≤ the work's fresh `available` ([catalog.md](catalog.md) rule 1); shortfalls return `409 insufficient` with per-line counts. The webhook re-checks `available >= qty` before creating the order. Displayed stock was advisory; this check is authoritative. Re-fetch is one uncached call per line — `getFreshProduct()` — because `product_id` takes a single id only.
3. **Payment precedes order creation.** Decided 2026-08-12, built 2026-08-16 with LiqPay, rebuilt 2026-11-18 with plata by mono: `/api/checkout` validates and creates a mono invoice but no order; the CRM order is only created in the `mono-callback` webhook, after mono's signature is verified and the decrypted order matches what mono says was paid. The order goes to the CRM with `info.is_paid: true`, `payment_type: "plata by mono"` and `status: "pending"`. The CRM reserves the stock on creation, into the warehouse named in the integration settings — confirmed working 2026-09-08, and confirmed to no-op for a product with no stock row in that particular warehouse (see the notes above).

   A charge can settle before a CRM outage or stock shortfall prevents order creation. The webhook logs the exception and the daily payment report identifies the unmatched charge. The shop operator resolves it in Mono and HugeProfit.
4. **One contract, two parsers.** `lib/checkout/schema.ts` (zod) is parsed by the form for field errors and by `/api/checkout` as the authority; issue messages are `t.checkout` keys, so the schema stays locale-free. UX: a field's error shows after its first blur, then tracks every change ("reward early, punish late"); an invalid submit focuses the first bad field. Rules: first and last name are separate required fields (Nova Poshta needs both); the first name is one word, since `/api/checkout` joins them into the order's `name` and `splitName` takes the first word as `first_name` — so the payload shape did not change (2026-11-05); email is optional (format-checked when given); phone must be Ukrainian (`0XX…`, `380XX…`, `+38 (0XX) …`) and is normalised to `+380XXXXXXXXX`.
5. **Delivery selections are verified on the server.** Buyers choose pickup, a Nova Poshta branch, a locker, or courier delivery. Town, branch, locker, and street choices come from Nova Poshta. Courier requests also include the house number and optional apartment. `lib/checkout/delivery.ts` resolves the selected refs again and checks the town, branch or locker type, operating status, and courier eligibility as applicable. A bad selection returns `400 delivery`. A Nova Poshta outage returns `503 delivery_unavailable`. Both checks happen before payment.

## The flow (`app/api/checkout/route.ts` + `app/api/checkout/mono-callback/route.ts` — BUILT 2026-11-18)

```
1. POST /api/checkout receives { items: [{workId, qty, price}], contact, delivery }  — price is for comparison only
2. Parse with checkoutRequestSchema (rule 4): qty 1–99 integers, no duplicate work ids, ≤20 items, contact rules
2b. resolveDelivery() against live Nova Poshta (rule 5) — 400 "delivery" / 503 "delivery_unavailable"
3. getFreshProduct() per line — uncached, one call each (product_id takes a single id)
4. lockLines (lib/checkout/lock.ts): 409 "unavailable" / "insufficient" / "repriced" (compared in kopecks);
   a CRM price that isn't whole kopecks (the CRM stores four decimals) → 400 "invalid", logged
5. reference = 15 random digits; the order { lines with unitPriceKop, totalKop, contact } is AES-256-GCM
   encrypted (lib/mono/payload.ts, MONO_PAYLOAD_KEYS) into webHookUrl = /api/checkout/mono-callback?p=…,
   capped at 8000 bytes by default (`MONO_CALLBACK_MAX_BYTES`), including any Preview bypass parameter
6. POST mono invoice/create { amount: totalKop, ccy: 980, reference, destination, redirectUrl:
   /checkout/result?ref=…&t=<signed ref>, webHookUrl } — never retried; pageUrl must be https on pay.monobank.ua / pay.mbnk.biz
7. 200 { pageUrl, reference } + HttpOnly cookie mono_inv_<reference>=<invoiceId>; the browser stores
   { reference, cart fingerprint } in sessionStorage and goes to pageUrl
8. mono POSTs every status change to mono-callback: X-Sign (ECDSA over the raw body) verified, then only
   'success' proceeds: decrypt ?p → amount/reference/currency/finalAmount/cancelList checks → CRM lookup
   (recorded → 200) → fresh mono status (any reversal/refund/cancellation → reconciliation) → stock re-check
   → POST /bapi/remote_orders with the LOCKED prices, info.is_paid: true, payment_type "plata by mono",
   order_text "mono invoice <invoiceId>" → reservedProducts must cover every line
9. /checkout/result?ref=&t= shows mono's status for that attempt (cookie); without the cookie (other browser,
   bank app) the invoice id comes from mono's statement (from a day before the link's signed issue time,
   ≤31 days); either way its live invoice/status decides (paid / refunded). Not in the statement (lag, or past its 31 days):
   the invoice noted in our CRM order (`mono invoice <id>`). An order with no usable invoice ID stays pending.
   Neither an invoice nor an order found → pending for `MONO_RESULT_PENDING_MINUTES` after issue (default 15),
   then «Оплату не знайдено». `t` = `keyId.issuedAt.mac`, required before any mono or CRM call. No valid `t` → unknown.
   The cart is cleared only on a full success for the same attempt whose cart is unchanged
```

Responses to mono: 200 for handled or unfixable-by-retry (logged `[mono-callback] reconcile` with invoice id, reference, amounts, product ids — never buyer data or the URL); 503 for transient failures (CRM/mono read failed, write outcome unknown, payment mode check failed) — mono retries, three attempts in all.

### Payment — plata by mono, built 2026-11-18

`lib/mono/client.ts` — invoice create/status, statement, merchant details (payment mode), webhook verification with a cached public key (refetched after a failed check at most once per 10 s, single-flight). Checkout-time CRM reads (`getFreshProduct`) time out after 10 s → 503. `lib/mono/rules.ts` — pure rules: payment mode (live = Production + `MONO_MERCHANT_ID` + 34998; test = elsewhere + `MONO_TEST_MERCHANT_ID` + 51630; anything else disables payments and CRM order writes), signed-event and adverse-evidence checks. `lib/mono/money.ts` — integer kopecks; `toKop` is exact for the CRM's four-decimal prices.

`app/api/checkout/mono-callback/route.ts` is the only place a CRM order is created for a paid checkout. `app/api/payment-report/route.ts` (`?key=REPORT_KEY`, optional `&from=&to=`, ≤31 days — mono's statement limit) lists paid invoices with no CRM order (balance still held after a partial refund), orders not marked as this invoice's payment (not checked once sold), mismatched or unreserved orders, refunds and reversals (a failed cancellation is none) — each line followed by «Що робити:» (`actionFor`, `lib/mono/report.ts`). It is the record: Vercel Hobby keeps logs for one hour.

The report recognizes site invoices by the reference and `Замовлення Plai Pich #<reference>` in the statement's `destination`. It verifies those invoices against live mono status. Pending cancellations take priority over CRM changes. For a partial refund, the report shows the original charge, the amount refunded, and the remaining balance. Set `REPORT_WINDOW_DAYS` to cover the shop's refund period (7 by default). When a window takes more than one request, the operator copies the displayed `&resume=` parameter into the report URL and reads each part. If an invoice appears or disappears between parts, the report asks the operator to restart that window.

**Verified against mono's test API 2026-11-18** (probe + Task 3/8): test merchant `test_4U18rFLZus`; `reference` ≤1000 chars and `destination` ≤280; a 4030-char webhook URL delivered intact for created/processing/success, each X-Sign valid; the `processing` webhook carries `finalAmount: 0`; statement items carry `invoiceId, status, maskedPan, approvalCode, rrn, date, paymentScheme, amount, profit, ccy, reference, destination`; a statement window over 31 days answers 400.

### CRM mapping — `POST /bapi/remote_orders`

The whole body goes **inside a `data` wrapper**: `{ "data": { … } }`.

| CRM field | Source | Notes |
|-----------|--------|-------|
| `order_id` | server-generated reference | random 15-digit string, also sent as Mono's invoice reference |
| `price`, `currency` | server-computed total, `"UAH"` | required |
| `first_name`, `last_name` | split from the single `name` field | first word / rest — crude but adequate; `first_name` required |
| `phone`, `email` | contact | optional in CRM; `phone` required by our rule 4, `email` optional since 2026-11-05 and omitted from the payload when blank — **an order without email is not yet verified against the live CRM** |
| `address_1` | `RemoteAddressType` | object: `{ address_1, city, delivery_cost }` all required, plus optional `ttn` and `delivery_operator` (`nova_poshta` \| `ukrposhta`). **`delivery_cost` is always `0`** — decided 2026-08-12; the site does not price delivery, the owners arrange it with the buyer. `city`/`address_1` carry NP's own text (e.g. «Відділення №1: вул. Якова Шепеля, 1», «Курʼєр: вул. Сковороди, 25, кв. 3», «Самовивіз: …»); `delivery_operator: "nova_poshta"` is sent for the three NP methods — from the API docs, **not yet seen on a live order**. |
| `order_data[]` | per line: `local_product_id`, `sku`, `name`, `quantity`, `price`, `total` | from fresh CRM data, not the cart. Use **`local_product_id`** (the HugeProfit product id) and leave `product_id: null` — `product_id` means the *marketplace* remote id, and the docs explicitly recommend `local_product_id` for products that live in HugeProfit, which ours do. |
| `status` | omit → `"pending"` | decided 2026-08-12: **always leave it `"pending"`**. Payment is signalled through `info.is_paid`, not the status — the owners drive the status themselves in the CRM. (Other documented values, unused by us: `processing`, `saled`, `cancelled`, `delivering`, `delivered`, `received`, `refund`, `arrived`.) |
| `info` | `InfoType` | `{ is_paid: true, payment_type: "<provider>", order_text?: … }` — `is_paid` is `true` by construction, since payment precedes order creation (rule 3). Carries the payment reference so the owners can match money to order. |

The CRM response includes `reservedProducts` with product and warehouse pairs. HugeProfit reserves stock when it creates the order, using the warehouse chosen in the token's integration settings. In the dev rehearsals, a reservation reduced `instock` while preserving `quantity`. A product without a stock row in the configured warehouse returned no reservation.

### Settings that live in the CRM, not in our code

The API token is bound in the HugeProfit UI to a sales channel and to the warehouses it may touch, including the reservation warehouse. Sales-channel tagging is therefore an owner setup step, never a request field.

**No sales channel — decided 2026-08-12.** The live account defines none, and a channel is only a reporting label ("shop vs. walk-in") inside HugeProfit's own reports. Orders arrive untagged and everything works. Revisit only if the owners ask to split website sales out in their reporting.

**Verified end to end again 2026-11-05**, sandbox payment over a tunnel with the order carried in `info`: locker order `1793895731982` landed complete — `is_paid: true`, NP's locker text in `address_1`, and `delivery_operator: "nova_poshta"` accepted (the CRM added its own `clients_delivery` id), stock reserved in 51630. An order with a blank email has **not** been sent yet.

## Open decisions

- **Nova Poshta: no key, no known limits.** The site calls NP without an `apiKey` — all four lookups (`searchSettlements`, `getWarehouses` by settlement and by `Ref`, `searchSettlementStreets`) answered keyless on 2026-10-29 and 2026-11-05. That is observed, not documented: if NP starts refusing, add `apiKey` back in `lib/nova-poshta/client.ts` with a key from the owners' NP cabinet. NP's rate limits are undocumented; the lookup routes are public and cached at the CDN (success only, 1 day), which is the only brake.
- **Lockers vs. artwork size.** Parcel lockers have per-cell size limits; the form warns that a large work may not fit, but nothing checks dimensions.

- **`WEBSITE_URL` must be the exact origin.** The mono `webHookUrl` is built from it; a trailing slash or the apex `pich.co.ua` answers 308, which LiqPay did not follow (2026-11-05) and mono is assumed not to (unverified). See CLAUDE.md "The mono webhook URL carries the order".

- **Checkout request limits.** The public checkout route validates at most 20 distinct lines and can create a Mono invoice. Stock reservation happens in HugeProfit after the signed success webhook creates the paid order.
- **Duplicate deliveries no longer upsert blindly** (2026-11-18). Re-POSTing an `order_id` still overwrites the order in place (confirmed 2026-09-07), so `mono-callback` looks the reference up first (`GET /bapi/remote_orders?order_id=`, filtered to our `integration_id`) and writes only when no order of ours exists; a differing order goes to reconciliation, never rewritten. Two deliveries racing on different server instances can still both see "absent" — accepted (spec non-goal).

Ordering rules: fetch fresh stock per work, lock prices at invoice creation, send `delivery_cost: 0`, and leave order status `pending` with `info.is_paid: true`. The shop uses no sales channel tag.
Resolved 2026-08-16: payment provider is LiqPay — decided and built. Replaced 2026-11-18 by plata by mono before LiqPay went live (design `.claude/docs/specs/2026-11-18-plata-by-mono-design.md`).

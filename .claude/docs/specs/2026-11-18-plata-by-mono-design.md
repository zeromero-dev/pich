# Replace LiqPay with plata by mono — design

**Status:** draft for approval, 2026-11-18. Reviewed by Codex (5 rounds, 2026-11-18); the round-5 fixes (line-total decoder, reservation warehouse in the report) were applied after the last round and not re-reviewed.

**Branch:** `feat/plata-by-mono`, off `master` (decided 2026-11-18). `master` has no Meta code, so the Conversions API Purchase is out of this scope; `feat/meta-pixel` ports its Purchase call into `mono-callback` when it rebases (see "Handover to feat/meta-pixel").

**Order (decided 2026-11-18):** mono on this branch → owners' production token → mono cutover and site launch → `feat/meta-pixel` rebased onto `master` and ported (handover section below). The site launches without the Meta pixel.

**Ship timing:** build and verify on the branch with the test token; **do not merge or deploy** until the owners have a production token (decided 2026-11-18). Merge, Vercel env and the real purchase go in a separate mono cutover plan, which supersedes `docs/plans/2026-09-09-liqpay-production-cutover.md`.

## Intent

The owners want payments through plata by mono (monobank internet acquiring) instead of LiqPay. LiqPay was never switched to live keys (`docs/plans/2026-09-09-liqpay-production-cutover.md` is still open), so no real money has moved through it and no live payment can be in flight at the switch.

The checkout still validates against fresh CRM data, redirects to a hosted payment page, and creates a paid CRM order only from the provider's webhook (`.claude/docs/domain/checkout.md` rule 3). The migration also makes the displayed, charged, and recorded amounts agree down to the kopeck.

## Goals

- A buyer pays on monobank's hosted page (`pay.monobank.ua` / `pay.mbnk.biz`) and lands back on `/checkout/result`.
- monobank's signed webhook verifies the amount and currency, rechecks stock, and creates the CRM order with `info.is_paid: true`. Payments that need intervention go through the reconciliation procedure below.
- Still no database, no S3, no new npm dependency.

## Non-goals

- Automated refunds, holds (`paymentType: hold`), saved cards, Apple/Google Pay configuration, ПРРО fiscal receipts (`merchantPaymInfo.basketOrder`).
- Atomic deduplication of simultaneous webhooks across server instances. See "Webhook retries and reconciliation" for the remaining risk.
- Keeping LiqPay as a switchable fallback.
- Applying updated prices to the cart on `409 repriced` (today it only shows an error; unchanged).
- A durable store for order snapshots (approach C, rejected). Consequence accepted: a paid order whose callback never arrives cannot be rebuilt from our side; the reconciliation report finds it and the operator refunds or contacts the buyer.

## Anti-goals

- Buyer data (name, phone, address, email) readable in any URL that lands in logs. LiqPay hid it inside its signed body; the mono carrier is a URL, so it must be encrypted, not just signed.
- A paid order that silently never reaches the CRM.
- Test-token payments creating orders in the real shop warehouse.

## What monobank's API gives us (verified 2026-11-18 with a test token)

| Fact | Evidence |
|---|---|
| Auth: one header `X-Token`. Test token from api.monobank.ua; `GET /api/merchant/details` returns `merchantId: "test_…"`, `edrpou: "4242424242"` for it | probe |
| `POST /api/merchant/invoice/create` → `{ invoiceId, pageUrl }`; `amount` in **kopecks** (int), `ccy: 980` | docs + probe |
| `merchantPaymInfo.destination` max **280** chars (`'destination' is too long` at 281) | probe |
| `merchantPaymInfo.reference` max **1000** chars; echoed back in full | probe |
| Status/webhook body includes `invoiceId`, `status`, `amount`, `ccy`, and our `reference`. It can also include `finalAmount` (after refunds), `createdDate`, `modifiedDate`, `destination`, and `paymentInfo`. `basketOrder` and `comment` are unavailable on this path | [invoice status docs](https://monobank.ua/api-docs/acquiring/methods/ia/get--api--merchant--invoice--status) + probe |
| `pageUrl` host: `pay.monobank.ua` in the probe; mono's docs example shows `pay.mbnk.biz` | probe + docs |
| `webHookUrl` with a **4030-char** query was accepted and delivered byte-intact for `created`, `processing`, `success` (accepted up to 12 049 chars at create) | probe through a cloudflared tunnel |
| Webhook signature: header `X-Sign` = base64 ECDSA-SHA256 over the **raw body**; key = base64 PEM from `GET /api/merchant/pubkey` (needs `X-Token`). `crypto.verify('sha256', rawBody, pem, sig)` returned true for all three deliveries | probe |
| Delivery: up to three POST attempts total per status change, stopping on HTTP 200. Events can arrive out of order. Ordinary unpaid invoices do not send an `expired` webhook | [delivery docs](https://api.monobank.ua/docs/acquiring.html) and [invoice creation docs](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create) |
| Statuses: `created, processing, hold, success, failure, reversed, expired`. A test token yields plain `success` — there is **no `sandbox` status** | docs + probe |
| Test mode: any Luhn-valid card; Apple/Google Pay hidden | docs |
| Cyrillic `destination` round-trips correctly over UTF-8 | probe |

Not verified: whether monobank follows a 3xx on the webhook URL (assume not, like LiqPay — `WEBSITE_URL` stays the exact origin); whether `redirectUrl` gets anything appended.

## Approaches (picked: A, 2026-11-18)

The order (lines, contact, delivery, Meta match data) must survive from `/api/checkout` to the webhook with no database. monobank echoes back only `reference` (≤1000) and `destination` (≤280).

- **A — encrypted order in our own `webHookUrl` query** (picked). The tunnel probe verified delivery with a 4030-character query. Set a byte cap for the full serialized URL based on a successful test on the deployed Vercel ingress, within the limits of every hop. Reject oversized checkout payloads before creating an invoice. [Vercel URL limit](https://vercel.com/docs/errors/url_too_long)
- **B — create the CRM order unpaid at checkout, mark paid in the webhook.** Breaks rule 3 (payment before order), reserves stock for abandoned checkouts, and an order-update endpoint is unverified.
- **C — key-value store (Vercel KV).** Breaks "no database".
- *Rejected:* the order in `reference` — a worst-case order (two 50-char Cyrillic names, 254-char email, courier address, 400-char user agent, several lines) is ~1.5 KB of JSON before encoding; it does not reliably fit 1000.

## Design

### Flow

```
1. POST /api/checkout validates contact, delivery, and cart against fresh CRM data.
2. Lock validated unitPriceKop and qty for every line. Sum to totalKop.
   Generate a collision-resistant digits-only reference string for this invoice attempt.
3. payload = encrypt({ version, reference, lines, totalKop, contact })
   Check the byte length of the full callback URL before creating the invoice.
4. POST /api/merchant/invoice/create {
     amount: totalKop, ccy: 980, paymentType: 'debit',
     merchantPaymInfo: { reference, destination: `Замовлення Plai Pich #${reference}` },
     redirectUrl: `${WEBSITE_URL}/checkout/result?ref=${reference}`,
     webHookUrl:  `${WEBSITE_URL}/api/checkout/mono-callback?p=${payload}` }
5. Require pageUrl to be https on an allowlisted host (pay.monobank.ua — seen in
   the probe; pay.mbnk.biz — in mono's docs example). Respond 200 { pageUrl, reference }
   + cookie `mono_inv_<reference>=<invoiceId>` (HttpOnly, Secure, SameSite=Lax,
   path /checkout, 1 day). An ambiguous create response → generic error; the buyer
   never saw that pageUrl, so it can't be paid, and a resubmit makes a new reference.
6. Browser stores { reference, cartFingerprint } in sessionStorage (fingerprint =
   sorted productId:qty:unitPriceKop of the submitted cart), then
   window.location.assign(pageUrl)
7. mono-callback verifies X-Sign over the raw body. A verified success triggers
   payload and payment validation, then a fresh CRM lookup by reference.
   If there is no order, recheck stock and confirm the latest mono status before
   creating the paid order with locked amounts, paymentType 'plata by mono',
   and orderText `mono invoice ${invoiceId}`.
   See "Webhook retries and reconciliation" for acknowledgement and failure rules.
8. /checkout/result?ref= reads cookie `mono_inv_<ref>`, queries mono, and requires the
   invoice's reference === ref. The cart is cleared only when the status is `success`
   with `finalAmount` (if present) equal to `amount`, sessionStorage holds the same
   ref, AND the current persisted cart's fingerprint equals the stored one. The marker
   survives `created`/`processing` and failed status reads (the page offers a
   refresh), and is removed once a terminal status (success, failure, reversed,
   expired) has been handled. Revisiting an old success page, editing the cart
   after returning, or editing it in another tab never clears a newer cart.
```

### Money

**The unit of account is the kopeck.** For each line, `lineTotalKop = unitPriceKop × qty`. The payable total is `totalKop = sum(lineTotalKop)`. The current checkout charges the sum of the locked merchandise prices and sets `delivery_cost` to zero. Acquiring fees and net settlement amounts do not enter this calculation.

1. **Normalize at the CRM boundary.** The CRM sends prices as JSON numbers with exactly four decimals (`1300.0000`; all 114 price fields read on 2026-11-18), i.e. it stores four decimal places. Any such value below 10¹¹ has ≤15 significant digits and survives `JSON.parse` as the nearest double, so no raw-token reader is needed. Convert with `k = Math.round(n * 100)` and accept only when `k / 100 === n` — exact for these inputs (brute-force 2026-11-18: 10⁷ four-decimal values 0.0001–1000 and 5·10⁶ random ones up to 10⁸, zero misclassified). Reject non-finite, zero, negative, above the amount bound (rule 2), and fractional-kopeck values (`10.0050`). *Assumption, re-checked in the dev CRM before launch:* the CRM never sends more than four decimals; a value like `19.9900000000000001` would collapse to `19.99` before we see it. Log the product ID and return a generic checkout error before invoice creation for an invalid fresh price.
2. **Validate and lock at invoice creation.** Accept one to 20 distinct products with integer quantities from 1 to 99 and sufficient fresh stock. The buyer's displayed unit prices are for comparison. If a fresh CRM unit price differs in kopecks, return the existing `409 repriced` response and require the buyer to confirm the updated cart before taking payment. Validate every unit price, line total, and running sum as a positive safe integer, and the total against `MAX_TOTAL_KOP` — a constant set to the confirmed acquiring terminal limit (≤ 10¹³ kopecks either way, far inside the range where `kop / 100` serializes exactly; see rule 5). Store `productId`, `unitPriceKop`, and `qty` on each encrypted line, plus `totalKop` on the payload.
3. **Show exactly what will be charged.** Format the cart and checkout unit prices, line totals, and payable total from integer kopecks. Show fractional hryvnias when present. For three units at ₴19.99, the buyer sees ₴59.97 and mono receives `amount: 5997`. `lib/format.ts` currently rounds to whole hryvnias and must be updated for these payment displays.
4. **Verify before writing a paid order.** After signature verification, require a valid `success` event with a nonempty `invoiceId`, an exact reference match, numeric `ccy === 980`, and a positive safe-integer `amount`. Validate the decrypted schema and line bounds again, then require `body.amount === payload.totalKop` and `payload.totalKop === sum(unitPriceKop × qty)`. If `finalAmount` is present, require it to be a safe integer equal to the same total for automatic fulfillment. A missing `finalAmount` is allowed. Route a differing `finalAmount` to reconciliation. Mono defines it as the amount after refunds. `paymentInfo.fee` and statement `profitAmount` describe acquiring and settlement. [Invoice status fields](https://monobank.ua/api-docs/acquiring/methods/ia/get--api--merchant--invoice--status) · [Statement fields](https://monobank.ua/api-docs/acquiring/extras/statement/get--api--merchant--statement)
5. **Write the locked total to HugeProfit.** Use the locked unit prices even if the CRM catalog price changes while the invoice is open. Serialize `order_data[].price`, `order_data[].total`, and `data.price` as `kop / 100` from unit, line, and order kopecks. `JSON.stringify(kop / 100)` emits the exact two-decimal value for every integer up to 10¹⁵ (brute-force 2026-11-18: all 0–2·10⁷ and 5·10⁶ random up to 10¹⁵, zero errors); `MAX_TOTAL_KOP` keeps us far below that. A unit test asserts the token for boundary values. When reading an order back, compare the numeric order total (`price`) through the same rule-1 conversion — never parse localized line strings such as `500,32 грн`. Replace the existing float multiplications and sum in `lib/hugeprofit/orders.ts` for the mono path. Keep `currency: 'UAH'`, `delivery_cost: 0`, and the paid flags on the order and lines.

### Webhook retries and reconciliation

- Generate the digits-only reference with a cryptographically secure random source. Use that same string as mono's `merchantPaymInfo.reference` and HugeProfit's `order_id`, and preserve it as a string through both APIs. Verify the supported width and exact round-trip in the dev CRM before choosing the reference format. Issue at most one mono invoice creation request for each reference. Treat an ambiguous mono create response as an unknown outcome and avoid automatic invoice creation retries. [HugeProfit remote orders](https://api-doc.h-profit.com/api_documentation/#remote-orders)
- Look up the CRM order before rechecking stock on every valid `success` callback: uncached `GET /bapi/remote_orders?order_id=<reference>` (documented: returns the order "whatever its date and state"). The docs warn the result "also contains orders of the other integrations of your account", so **keep only entries whose `integration_id` equals ours** (`CRM_INTEGRATION_ID`, read once from a known order during setup). The response must be `success: true` with a `response` array; anything else is a transient failure (503) and **never authorizes a write**. Exactly one entry of ours with the invoice ID in `info.order_text`, the exact reference, `is_paid`, UAH (or CRM's `грн`), the exact total in kopecks, **and lines matching the payload by product ID and quantity** means the payment is recorded → 200 — provided that, while the order is still pending (`sales_id` null), every line carries reservation metadata (`is_reserved: true`, as seen on the 2026-08-13 order). An order with `sales_id` set has been converted to a sale by the owners, which releases the reservation by design, so it counts as recorded without the reservation check. A pending entry with missing lines or reservations is a partial commit → reconciliation, no write. Zero entries of ours → recheck stock and create. Anything else (several entries, or one that differs) → reconciliation, no write. A read followed by an upsert still leaves a concurrency window across instances, and an upsert would overwrite an operator's edits — which is why a differing order is never rewritten. [HugeProfit remote orders](https://api-doc.h-profit.com/api_documentation/#remote-orders)
- Before the first CRM write, fetch the latest mono status uncached for the signed `invoiceId`, to catch a reversal or refund the delivered event doesn't show. The read must match the invoice ID, reference, `ccy`, and `amount`, else reconciliation. **Adverse evidence blocks regardless of timestamps** (`modifiedDate` is optional): status `reversed`/`failure`, a `finalAmount` below the total, or any `cancelList` entry (pending, done, or failed) in either the webhook body or the read → reconciliation, 200. Only a read with *no* adverse evidence that merely lags (`created`/`processing`, older or missing `modifiedDate`) falls back to the signed `success`, rather than spending one of monobank's three delivery attempts on a 503. If the status read itself fails, return 503. A reversal after the status check can still require operator action. [Mono invoice status](https://monobank.ua/api-docs/acquiring/methods/ia/get--api--merchant--invoice--status)
- After the write, check the CRM's response: `success: true` and `reservedProducts` (`[product_id, warehouse_id]` pairs) containing every line's product in the reservation warehouse. The pairs carry no quantity, so multi-unit reservation stays a rehearsal item (three units below). A persisted but unreserved or partly reserved order → reconciliation (the CRM saves orders with incomplete lines silently, and a product with no stock row in the reservation warehouse is not reserved — checkout.md 2026-09-07). After a write with an uncertain outcome (timeout, 5xx), repeat the lookup before responding. A match means the write landed. If the outcome remains unknown, return 503 and let the next delivery start with a fresh lookup. Do not issue a second write within that delivery. Return 503 for other transient failures such as a public-key service outage or a failed CRM stock or order read. Return 200 after a confirmed write or known harmless redelivery. A definitively invalid signature gets 200 with a verification log and no order action.
- For a verified payment with an unreadable payload, a reference, currency, or amount mismatch, a conflicting CRM record, a permanent CRM rejection, or insufficient stock, record a reconciliation exception and return 200. Route signed reversals and refund discrepancies to the same review. Use the current mono status and `modifiedDate` when reconciling out-of-order events. Other statuses leave the CRM unchanged.
- **Zero deliveries are possible** (three attempts, then monobank stops), so exception logs alone can't find every lost order. `GET /api/checkout/reconcile?key=<RECONCILE_KEY>` — a link like «Оновити сайт», but with its own key (a leaked `SYNC_KEY` must not expose payments, nor the reverse); no cron. Default window: the last 7 days; `&from=YYYY-MM-DD&to=YYYY-MM-DD` for catch-up after a missed check (the operator notes the date of the last clean check outside the app). It reads the mono statement (`GET /api/merchant/statement`) and looks each invoice's `reference` up in the CRM by exact `order_id` (which returns the order whatever its state, including orders already converted to sales) under the same `integration_id` rule. The statement has no product lines — those live only in the encrypted callback payload — so the report checks what the statement and the CRM alone can prove: identity, payment status, and totals, plus two CRM-internal checks per matched order — the sum of its line totals equals the order total (catches a silently dropped line), and while `sales_id` is null every line has `is_reserved: true` **with its reservation warehouse (`mid`) equal to `CRM_WAREHOUSE_ID`** (catches an unreserved line or one reserved in the wrong warehouse). Line totals are read by a report-only decoder: HugeProfit documents `order_data[].total` as a localized string (`500,32 грн`), unlike the numeric order `price`. The decoder accepts a JSON number or the documented `<digits>[,<1–2 digits>] грн` form and converts straight to integer kopecks (no float); a missing or unrecognized value marks that order "unverifiable" in the report rather than passing or failing it. The formats actually returned are confirmed in the dev CRM before launch. This decoder is the one exception to Money rule 5's "never parse localized line strings" — the webhook still compares only the numeric total. **The report must be sufficient on its own:** Vercel Hobby keeps runtime logs for one hour ([limits](https://vercel.com/docs/logs/runtime#limits)), so logs add detail only while fresh and are never the record. Every webhook exception class ends up visible to the report: an unreadable payload, reference/amount/currency mismatch, permanent CRM rejection, or sold-out-after-payment leaves no CRM order ("paid, no CRM order"); a partial commit fails the line-sum or reservation check; a differing order of ours fails the total or line-sum check. Residual blind spot, accepted: a CRM order whose lines differ from the payload but sum to the same total with all lines reserved (requires the CRM to substitute a product). Before labelling a cancellation, it reads the invoice's current status (statement cancellation entries carry no status). It lists in plain text: paid invoices with no CRM order; orders whose total differs, whose line totals don't sum to it, or with an unreserved line while pending; and, per matched order, a full reversal, a partial refund, or a pending cancellation — marked "converted to sale" when `sales_id` is set. Response headers: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. It reads only and never writes. Refund catch-up is driven by the statement window alone: the default window covers the refund period agreed with the owners (7 days unless they choose longer). *Verify in test before launch:* whether the statement lists a refund made later on an older purchase (mono documents separate payment and cancellation dates); if it does not, the default window widens to the agreed refund period. Our code never logs the report URL; Vercel's own request logs show it to project members, who can already read every env var — accepted.
- **Operator procedure** (agreed with the owners before launch: an operator, a backup, and a daily check). Open the reconcile link daily. For each line, check the latest state in the mono cabinet, then:
  - *Paid, no CRM order* — no recoverable snapshot (the order lived only in the callback URL): contact the buyer if they reached out, otherwise refund in the mono cabinet within 7 days.
  - *Full reversal on a matched order* — cancel the CRM order (releases the reservation). If it is marked "converted to sale", use HugeProfit's sale-return workflow instead.
  - *Partial refund* — keep the order; adjust its lines/total in the CRM to what is still being fulfilled, by hand (a return on the sale if already converted).
  - *Unreserved or incomplete order* — reserve or correct it by hand in the CRM, or refund the missing part.
  - Vercel runtime logs (1 h on Hobby) only add the reason when looked at soon after; the daily pass never depends on them.
  - *Pending cancellation* — change nothing until it completes or fails; it reappears in the next report. Logs carry the invoice ID, reference, reason, currency, expected and reported amounts, and product IDs. Never buyer data, the callback URL, or upstream response bodies. [Mono statement API](https://monobank.ua/api-docs/acquiring/extras/statement/get--api--merchant--statement)

### Modules (replace `lib/liqpay/`)

- `lib/mono/client.ts` owns invoice creation, uncached invoice status and statement reads, merchant details, and webhook verification. Cache the public key per server instance; after a failed verification refresh it at most once per 5 minutes per instance (coalesced), so forged requests can't drive a provider call each. Distinguish a definitive invalid signature from a key-fetch failure. Webhook bodies over 16 KB are rejected before verification. Enable invoice creation only when the token and payload keys are configured, the payment mode check below passes, and `PAYMENTS_PAUSED` is not `"1"`.
- **Payment mode, fail closed — every identity is positively matched.** On first use `GET /api/merchant/details` is read (cached per instance). Exactly two combinations are allowed:
  - **Live:** `VERCEL_ENV === 'production'`, `merchantId === MONO_MERCHANT_ID` (the owners' id), `CRM_WAREHOUSE_ID === '34998'`.
  - **Test:** `VERCEL_ENV !== 'production'`, `merchantId === MONO_TEST_MERCHANT_ID` (`test_4U18rFLZus` today), `CRM_WAREHOUSE_ID === '51630'`, and a HugeProfit token from the separate dev integration whose reservation warehouse is 51630 (set up by hand — no API exposes that setting).
  
  Everything else — an unknown merchant id, a failed details read, a live token outside Production, a test token in Production, a mismatched warehouse — disables both invoice creation (503 `payments_disabled`) and remote-order writes in `crmPost`. This replaces `MONO_TEST` and the `LIQPAY_SANDBOX` guard at `lib/hugeprofit/client.ts:99`.
- `lib/hugeprofit/client.ts` error messages stop including upstream body excerpts on the order path (status code and error key only).
- `lib/mono/payload.ts` uses AES-256-GCM with a fresh random IV for each encryption. The envelope is `keyId.iv.ciphertext.tag`, with base64url binary fields and `keyId` authenticated as additional data. Encrypt with the active key and decrypt with the specified key. Keep retiring keys available until their invoices, deliveries, and unresolved cases are reconciled. Payload keys rotate independently of `MONO_TOKEN`.
- `lib/mono/types.ts` defines the versioned `CheckoutPayload`, locked kopeck lines, and `MonoStatus`. Validate the decrypted payload at runtime before using it.
- `app/api/checkout/mono-callback/route.ts` replaces `liqpay-callback` and verifies the signature over the raw request bytes before parsing.
- `components/checkout/checkout-view.tsx`, the cart, and `lib/format.ts` use the kopeck amounts for payment displays. Checkout redirects via `window.location.assign(body.pageUrl)`.
- `lib/hugeprofit/orders.ts` owns exact CRM money serialization and the uncached order lookup scoped to the integration.
- `app/api/checkout/reconcile/route.ts` — the read-only report above.
- Persisted carts hold float prices from before the switch; the cart converts them with the rule-1 function on read and drops a line that fails (the catalog price then reappears on re-add).
- `app/checkout/result/page.tsx` and `components/checkout/result-view.tsx` show payment status from mono using the attempt's cookie and `?ref=` (flow step 8). A successful full payment confirms the charge. The page must avoid promising CRM order creation from payment status alone. `failure`, `expired`, and `reversed` show their respective payment outcomes. In-progress or temporarily unavailable status stays unconfirmed.
- Delete `lib/liqpay/`, `app/api/checkout/liqpay-callback/`.

### Rollback

Rollback never removes `mono-callback`, `MONO_TOKEN`, or payload keys: outstanding invoices stay payable for 24 h and their callbacks must still land. To stop taking new payments, set `PAYMENTS_PAUSED=1` (checkout answers 503 `payments_disabled`) and redeploy; callbacks and the reconcile report keep working.

### Handover to feat/meta-pixel

When `feat/meta-pixel` rebases, add `MetaMatch` and `meta?` to `CheckoutPayload` in `lib/mono/types.ts` and retest the maximum encoded callback URL with those fields. Send Purchase from `mono-callback` only after confirming the CRM order, using the locked amount and a stable event ID keyed to the invoice for redeliveries. Send real events only in live payment mode and use `META_TEST_EVENT_CODE` for test events. Update the privacy and cookie copy to name mono.

### Env

| Var | Change |
|---|---|
| `MONO_TOKEN` | new, server-only. Test token locally/Preview; production token from the owners' business cabinet |
| `MONO_MERCHANT_ID` | new; Production only — the owners' merchant id from `GET /api/merchant/details`. Its match is what makes payments live |
| `MONO_TEST_MERCHANT_ID` | new; local/Preview only — the test merchant id (`test_4U18rFLZus`) |
| `RECONCILE_KEY` | new, server-only — key in the reconcile report link; separate from `SYNC_KEY` |
| `CRM_INTEGRATION_ID` | new; our HugeProfit integration id (per environment), for the order lookup filter |
| `PAYMENTS_PAUSED` | new, optional; `"1"` stops new invoices, callbacks keep working |
| `MONO_TEST` | not used — remove from `.env.local` (mode comes from the merchant id) |
| `MONO_PAYLOAD_KEYS` | new, server-only. An active key ID and a map of key IDs to 32-byte keys. Use separate keys by environment. Keep prior decryption keys during rotation as described above |
| `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX` | removed (`.env.example`, Vercel) |

### Copy and docs

- `lib/i18n.ts` `paymentNote` (UA/EN): «…сторінку оплати plata by mono» / "plata by mono's secure payment page".
- `lib/info-pages.ts`: LiqPay (АТ КБ «ПриватБанк») → plata by mono (АТ «Універсал Банк»), in the payment, card-data, privacy-recipient and cookie paragraphs. Payment methods list: Visa/Mastercard and Apple Pay/Google Pay; «через Privat24» goes (my call — mono advertises Apple/Google Pay; unverified on the owners' production terminal). Owner review, like the other copy we wrote.
- The `mono_invoice` cookie is strictly necessary (shows the payment result), so the «Файли cookie» paragraph's "no advertising or tracking cookies" stays true.
- `.claude/docs/domain/checkout.md`, `CLAUDE.md` (stack, env, gotchas), `README.md` of domain docs: LiqPay → mono, with the verified facts above.
- `docs/plans/2026-09-09-liqpay-production-cutover.md`: superseded by a mono cutover plan (its CRM pre-flight tasks carry over unchanged).

### Verification before launch

- Test exact conversion, trailing zeros, invalid prices, validation at quantity and amount limits, and overflow of both a line and the running sum. Assert 5997 kopecks for `3 × 19.99` and 30 for `0.10 + 0.20`. Check that fractional prices are rejected before the invoice is created and that CRM serialization preserves the exact unit, line, and order amounts.
- Test payload round-trip, tampering, unknown keys, and decrypting outstanding payloads after key rotation. Exercise wrong reference, amount, or currency, invalid signature, public-key fetch failure, missing `finalAmount`, a reduced `finalAmount`, and a stale success followed by a reversal. In the out-of-order case, the current reversed status must prevent the old success from writing an order.
- Exercise duplicate delivery after stock has been reserved and a CRM timeout after the write landed. Both must find the existing matching order and avoid a second write. Exercise an order-reference conflict and a paid but sold-out checkout. Confirm the exception reaches the operator with enough information to reconcile it.
- Set `MAX_TOTAL_KOP` to the lower of the confirmed acquiring terminal limit and the HugeProfit amount range found in the dev CRM; re-check there that prices still arrive with four decimals (launch gate for the Money rule-1 assumption).
- Use a test token to buy three units of a ₴19.99 work in the dev warehouse (51630). Verify ₴19.99 per unit and ₴59.97 total in checkout, `5997` and `980` in the signed mono success, the same unit and total in the paid CRM order, and a stock decrease of three. Confirm the CRM returns the reference and invoice identifier on exact lookup.
- Payment mode matrix (each → 503, no invoice, `crmPost` refuses order writes): a test token on Production; Production with `CRM_WAREHOUSE_ID=51630`; the live merchant id in Preview/local; local/Preview with `CRM_WAREHOUSE_ID=34998`; an unknown merchant id; a failed merchant-details read.
- Webhook adverse-evidence cases: a `reversed` status read with no `modifiedDate`; a partial refund with an equal `modifiedDate`; a failed cancellation in `cancelList`. Each → reconciliation, no order.
- Timeout-after-commit with an incomplete or unreserved order on readback → reconciliation, no second write.
- Next-day detection without logs: in the dev CRM, leave a paid order with the correct total but an unreserved line (product with no stock row in 51630), and one with a dropped line; the following day's report lists both. Also a paid order reserved in the wrong warehouse (listed), and a clean order with a fractional price such as 3 × ₴19.99 (not listed — checks the line-total decoder for false alarms). Pay a sold-out item (stock zeroed after invoice creation) → the report lists "paid, no CRM order".
- Cart clearing: edit the cart after returning from the payment page; edit it in another tab during payment; revisit an old success URL. None clears the newer cart. Return while `processing`, then refresh after `success`: the purchased cart is cleared.
- Converted order: create a paid order, convert it to a sale in the dev CRM, redeliver the same `success` → 200, no write; then refund in the test cabinet → the report lists it as "converted to sale".
- Rehearse zero delivery: pay a test invoice while the callback route is unreachable, then confirm the reconcile report lists it. Rehearse a refund on a matched order (test cabinet) and confirm the report lists it.
- Vercel Preview has deployment protection, so monobank's callback needs the protection-bypass token in the webhook URL (`x-vercel-protection-bypass` query parameter, Preview only); count it in the URL byte cap. That secret bypasses protection on **every** deployment of the project, so create it only for the rehearsal and revoke it right after.
- Verify a callback at the chosen URL byte cap on deployed Vercel Preview with the test token, using the actual callback path and a representative maximum-size payload. Confirm an over-limit URL is rejected before invoice creation. Record the terminal amount limits and the HugeProfit amount and reference bounds before enabling production payments. Run through the statement reconciliation procedure with the assigned operator.

## Constraints

- No new dependency. Node `crypto` covers signatures, encryption, and reference generation.
- Keep `MONO_TOKEN`, `MONO_PAYLOAD_KEYS`, and requests to `api.monobank.ua` server-side.
- The webhook remains the only caller of `createRemoteOrder`.
- `WEBSITE_URL` exact origin, no trailing slash (webhook URL built from it).

## Owner prerequisites (outside the code)

- monobank business account and internet acquiring turned on in web.monobank.ua; production token issued there. monobank's page describes the path as a ФОП account; whether a ТОВ qualifies is unverified, and the legal entity is still open (`lib/info-pages.ts` PLACEHOLDER).
- Tariff (monobank.ua/acquiring, 2026-11-18): 1.3% UA cards, 2% foreign; payout next day; 0% for the first 30 days if connected Nov 1 – Dec 31.
- If they link a ПРРО in mono, `merchantPaymInfo.basketOrder` becomes required — out of scope until they say so.

## Calls made (my proposals — correct any)

1. Separate, versioned payload encryption keys preserve callback decryption across token rotation.
2. `invoiceId` carried to the result page in an httpOnly cookie, not the URL.
3. Default invoice `validity` (24 h) — stock is re-checked in the webhook anyway.
4. Payment mode from the merchant id matched against `MONO_MERCHANT_ID` (fail closed), not a `MONO_TEST` flag.
5. No `basketOrder` — the mono page shows only the total and `destination`.
6. Retry transient webhook failures with 503, checking CRM before each write. The operator reconciles terminal failures and payments missing from CRM.
7. Delivery page lists cards + Apple/Google Pay, drops Privat24.
8. Lost-callback detection is a report the operator opens daily, not a cron (matches «Оновити сайт»; Vercel Hobby). Its own `RECONCILE_KEY`, kept in the URL (not a header) so the operator can open it as a link; `no-store` and `no-referrer` limit where the URL leaks.
9. Exact prices via `Math.round(n*100)` + `k/100 === n` under the documented four-decimal CRM assumption, not a raw-JSON token reader.

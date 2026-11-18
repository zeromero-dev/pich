# Replace LiqPay with plata by mono — design

**Status:** draft for approval, 2026-11-18.

**Branch:** `feat/plata-by-mono`, off `master` (decided 2026-11-18). `master` has no Meta code, so the Conversions API Purchase is out of this scope; `feat/meta-pixel` ports its Purchase call into `mono-callback` when it rebases (see "Handover to feat/meta-pixel").

**Ship timing:** build and verify on the branch with the test token; **do not merge or deploy** until the owners have a production token (decided 2026-11-18). Merge, Vercel env and the real purchase go in a separate mono cutover plan, which supersedes `docs/plans/2026-09-09-liqpay-production-cutover.md`.

## Intent

The owners want payments through plata by mono (monobank internet acquiring) instead of LiqPay. LiqPay was never switched to live keys (`docs/plans/2026-09-09-liqpay-production-cutover.md` is still open), so no real money has moved through it and no live payment can be in flight at the switch.

The checkout *process* stays exactly as built: validate against fresh CRM data → pay on the provider's hosted page → the provider's webhook alone creates the CRM order, paid (`.claude/docs/domain/checkout.md` rule 3). Only the provider changes.

## Goals

- A buyer pays on monobank's hosted page (`pay.monobank.ua`) and lands back on `/checkout/result`.
- monobank's signed webhook creates the CRM order with `info.is_paid: true`, exactly as LiqPay's does today, including the stock re-check and the loud paid-but-not-created log.
- Still no database, no S3, no new npm dependency.

## Non-goals

- Refunds, holds (`paymentType: hold`), saved cards, Apple/Google Pay configuration, ПРРО fiscal receipts (`merchantPaymInfo.basketOrder`).
- Fixing the known duplicate-`order_id` upsert risk (unchanged; see checkout.md).
- Keeping LiqPay as a switchable fallback.

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
| Status/webhook body echoes `invoiceId, status, amount, ccy, finalAmount, createdDate, modifiedDate, reference, destination, paymentInfo` — **not** `basketOrder`/`comment` | docs + probe |
| `webHookUrl` with a **4030-char** query was accepted and delivered byte-intact for `created`, `processing`, `success` (accepted up to 12 049 chars at create) | probe through a cloudflared tunnel |
| Webhook signature: header `X-Sign` = base64 ECDSA-SHA256 over the **raw body**; key = base64 PEM from `GET /api/merchant/pubkey` (needs `X-Token`). `crypto.verify('sha256', rawBody, pem, sig)` returned true for all three deliveries | probe |
| Retries: up to 3 more times when we don't answer 200. Delivery order not guaranteed (`modifiedDate`) | docs |
| Statuses: `created, processing, hold, success, failure, reversed, expired`. A test token yields plain `success` — there is **no `sandbox` status** | docs + probe |
| Test mode: any Luhn-valid card; Apple/Google Pay hidden | docs |
| Cyrillic `destination` round-trips correctly over UTF-8 | probe |

Not verified: whether monobank follows a 3xx on the webhook URL (assume not, like LiqPay — `WEBSITE_URL` stays the exact origin); whether `redirectUrl` gets anything appended.

## Approaches (picked: A, 2026-11-18)

The order (lines, contact, delivery, Meta match data) must survive from `/api/checkout` to the webhook with no database. monobank echoes back only `reference` (≤1000) and `destination` (≤280).

- **A — encrypted order in our own `webHookUrl` query** (picked). The URL is ours and is delivered intact. Cost: the payload is ours to protect, and its size is effectively unlimited (4 KB proven).
- **B — create the CRM order unpaid at checkout, mark paid in the webhook.** Breaks rule 3 (payment before order), reserves stock for abandoned checkouts, and an order-update endpoint is unverified.
- **C — key-value store (Vercel KV).** Breaks "no database".
- *Rejected:* the order in `reference` — a worst-case order (two 50-char Cyrillic names, 254-char email, courier address, 400-char user agent, several lines) is ~1.5 KB of JSON before encoding; it does not reliably fit 1000.

## Design

### Flow

```
1. POST /api/checkout — unchanged through stock/price checks
2. paymentId = Date.now(); total in ₴ (server-computed)
3. payload = encrypt({ paymentId, lines, contact })                 → lib/mono/payload.ts
4. POST /api/merchant/invoice/create {
     amount: total * 100, ccy: 980,
     merchantPaymInfo: { reference: String(paymentId),
                         destination: `Замовлення Plai Pich #${paymentId}` },
     redirectUrl: `${WEBSITE_URL}/checkout/result`,
     webHookUrl:  `${WEBSITE_URL}/api/checkout/mono-callback?p=${payload}` }
5. 200 { pageUrl } + httpOnly cookie `mono_invoice=<invoiceId>` (path /checkout, 1 day)
6. Browser: window.location.assign(pageUrl)
7. monobank POSTs every status change to mono-callback:
     verify X-Sign over raw body → ignore unless status === 'success'
     → decrypt ?p → require body.reference === String(payload.paymentId)
       and body.amount === Σ line.price*qty*100
     → re-check stock → createRemoteOrder(isPaid, paymentType 'plata by mono',
       orderText `mono invoice ${invoiceId}`)
     → 200, except when createRemoteOrder throws: 500, so monobank retries
       (up to 3×). Safe: the retry carries the same payload and the CRM upserts
       by order_id with identical data. Bad signature / decrypt failure /
       reference or amount mismatch / sold out / non-success status → 200 + log
       (a retry can't fix them); sold out stays the loud paid-but-not-created log.
8. /checkout/result reads the cookie → GET invoice/status → success / failed / pending
```

### Modules (replace `lib/liqpay/`)

- `lib/mono/client.ts` — `paymentsEnabled()` (= `MONO_TOKEN` set), `createInvoice()`, `invoiceStatus(invoiceId)`, `verifyWebhook(rawBody, xSign)`. The pubkey is fetched once per server instance and cached in a module variable; on a failed verify, refetch once and retry (covers key rotation).
- `lib/mono/payload.ts` — AES-256-GCM, `iv.ciphertext.tag` in base64url; `decryptPayload` returns `null` on any failure (tamper = auth-tag failure). Key = HKDF-SHA256 of `MONO_TOKEN` (info `plai-pich-order-payload`) — no extra env var; rotating the token invalidates only payloads of unpaid invoices. *(Builder's call — see "Calls made".)*
- `lib/mono/types.ts` — `CheckoutPayload`, `LockedLine` move here unchanged; `MonoStatus` replaces `LiqPayStatus`.
- `app/api/checkout/mono-callback/route.ts` — replaces `liqpay-callback`; reads `await request.text()` before parsing.
- `components/checkout/checkout-view.tsx` — `redirectToLiqPay` becomes `window.location.assign(body.pageUrl)`.
- `app/checkout/result/page.tsx` + `components/checkout/result-view.tsx` — status by cookie `invoiceId`; paid = `success`; failed = `failure | expired | reversed`; else pending. The `sandbox` branch goes.
- `lib/hugeprofit/client.ts:99` — the production write guard keys on `MONO_TEST === '1'` instead of `LIQPAY_SANDBOX`.
- Delete `lib/liqpay/`, `app/api/checkout/liqpay-callback/`.

### Handover to feat/meta-pixel

When that branch rebases onto this one: `MetaMatch`/`meta?` go into `CheckoutPayload` in `lib/mono/types.ts` (the encrypted URL payload has room — 4 KB proven); the Purchase call moves into `mono-callback` after `createRemoteOrder` succeeds, real when `MONO_TEST !== '1'`, test-only with `META_TEST_EVENT_CODE` otherwise (the old `sandbox` rule); since the webhook now answers 500 on a CRM failure, the Purchase must be sent only after the order succeeds. Its privacy/cookie copy names mono instead of LiqPay.

### Env

| Var | Change |
|---|---|
| `MONO_TOKEN` | new, server-only. Test token locally/Preview; production token from the owners' business cabinet |
| `MONO_TEST` | new; `"1"` with a test token. Must never exist in Vercel Production |
| `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX` | removed (`.env.example`, Vercel) |

### Copy and docs

- `lib/i18n.ts` `paymentNote` (UA/EN): «…сторінку оплати plata by mono» / "plata by mono's secure payment page".
- `lib/info-pages.ts`: LiqPay (АТ КБ «ПриватБанк») → plata by mono (АТ «Універсал Банк»), in the payment, card-data, privacy-recipient and cookie paragraphs. Payment methods list: Visa/Mastercard and Apple Pay/Google Pay; «через Privat24» goes (my call — mono advertises Apple/Google Pay; unverified on the owners' production terminal). Owner review, like the other copy we wrote.
- The `mono_invoice` cookie is strictly necessary (shows the payment result), so the «Файли cookie» paragraph's "no advertising or tracking cookies" stays true.
- `.claude/docs/domain/checkout.md`, `CLAUDE.md` (stack, env, gotchas), `README.md` of domain docs: LiqPay → mono, with the verified facts above.
- `docs/plans/2026-09-09-liqpay-production-cutover.md`: superseded by a mono cutover plan (its CRM pre-flight tasks carry over unchanged).

### Check left behind

`lib/mono/payload.test.ts` in `npm test`: round-trip; a flipped byte → `null`; a payload from another key → `null`. Webhook signature verification is proven by the probe and re-proven by the plan's last task: a test-token payment over a tunnel that lands a paid order in the dev warehouse (51630) CRM.

## Constraints

- No new dependency (Node `crypto` covers ECDSA, AES-GCM, HKDF).
- `MONO_TOKEN` server-only; no `fetch` to `api.monobank.ua` from client code.
- The webhook remains the only caller of `createRemoteOrder`.
- `WEBSITE_URL` exact origin, no trailing slash (webhook URL built from it).

## Owner prerequisites (outside the code)

- monobank business account and internet acquiring turned on in web.monobank.ua; production token issued there. monobank's page describes the path as a ФОП account; whether a ТОВ qualifies is unverified, and the legal entity is still open (`lib/info-pages.ts` PLACEHOLDER).
- Tariff (monobank.ua/acquiring, 2026-11-18): 1.3% UA cards, 2% foreign; payout next day; 0% for the first 30 days if connected Nov 1 – Dec 31.
- If they link a ПРРО in mono, `merchantPaymInfo.basketOrder` becomes required — out of scope until they say so.

## Calls made (my proposals — correct any)

1. Encryption key derived from `MONO_TOKEN` rather than a separate env var.
2. `invoiceId` carried to the result page in an httpOnly cookie, not the URL.
3. Default invoice `validity` (24 h) — stock is re-checked in the webhook anyway.
4. `MONO_TEST` env flag (matches `LIQPAY_SANDBOX`), not auto-detection from the `test_` merchant id (observed, undocumented).
5. No `basketOrder` — the mono page shows only the total and `destination`.
6. Webhook answers 500 when `createRemoteOrder` throws, so monobank's retries can rescue a paid order through a CRM blip (LiqPay's handler always answered 200).
7. Delivery page lists cards + Apple/Google Pay, drops Privat24.

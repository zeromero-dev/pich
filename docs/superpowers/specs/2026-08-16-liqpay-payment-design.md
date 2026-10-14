# LiqPay Payment Integration — Design

**Status:** approved for planning (2026-08-16)
**Resolves:** the "Payment provider" open decision in `CLAUDE.md` and `.claude/docs/domain/checkout.md` — provider is **LiqPay**, hosted-redirect integration.

## Context

Checkout today (`app/api/checkout/route.ts`, `lib/hugeprofit/orders.ts`) creates CRM orders unpaid (`info.is_paid: false`) and the owners follow up to arrange payment — a deliberate 2026-08-12 fallback because no payment provider existed yet. `checkout.md` already specs the reversal: "When a payment provider does land, it moves *in front* of order creation and this rule reverts." This document is that reversal, made concrete for LiqPay.

The project has **no database**. Whatever holds cart/contact state between "buyer clicks Pay" and "payment settles" has to live somewhere that isn't our server — LiqPay's own request/callback round trip is that place.

## LiqPay mechanics (verified facts this design relies on)

Confirmed against LiqPay's official PHP SDK (`liqpay/sdk-php`) and independent secondary sources — not yet exercised against a live sandbox account:

- Every request is `{ data, signature }` where `data` is base64(JSON(params)) and `signature = base64(sha1(private_key + data + private_key))`. Verifying an inbound callback means recomputing this and comparing.
- Hosted checkout: browser is POSTed (via an auto-submitting HTML form) to `https://www.liqpay.ua/api/3/checkout` with `data`/`signature` fields. Server-to-server calls (e.g. status checks) go to `https://www.liqpay.ua/api/request`.
- `server_url` — LiqPay POSTs `{ data, signature }` here after the payment settles. This is the only source of truth; `result_url` (browser redirect target) is not verified and must never be trusted for anything but display.
- `sandbox: 1` on the request routes the payment through LiqPay's test environment; settled sandbox payments report `status: "sandbox"` instead of `"success"` — both must be treated as "paid."

**Flagged assumptions** (from training knowledge / partial doc access, not sandbox-verified — verify as the first implementation step, before building anything on top):
- `amount` is expressed in major currency units (e.g. `"1250.00"` for ₴1250), not the smallest unit.
- The status-check action is `action: "status"` posted to `https://www.liqpay.ua/api/request`, returning the same shape as a callback.
- LiqPay's `info` field's round-trip fidelity/size limit is **not used by this design** (see below), so it doesn't need verifying.

## Flow

```
1. Buyer fills the checkout form (unchanged UI: name, email, phone, city, address).
2. Client POSTs { items: [{workId, qty, price}], contact } to POST /api/checkout
   — identical validation to today: shape-check, getFreshProduct() per line
   (uncached), 409 "unavailable" / 409 "repriced" exactly as now.
3. On success, server:
   - computes the total server-side from fresh data (unchanged)
   - generates paymentId = Date.now()  (same scheme as today's newOrderId)
   - base64url-encodes { lines, contact, total } as `payload`
   - builds a signed LiqPay checkout request:
       action: "pay", amount: total, currency: "UAH", order_id: paymentId,
       description: `Замовлення Plai Pich #${paymentId}`,
       result_url: `${WEBSITE_URL}/checkout/result?paymentId=${paymentId}`,
       server_url: `${WEBSITE_URL}/api/checkout/liqpay-callback?payload=${payload}`,
       sandbox: 1 if LIQPAY_SANDBOX=="1"
   - returns { data, signature } (200) — no call to LiqPay happens server-side yet.
4. Client renders a hidden <form method="POST" action="https://www.liqpay.ua/api/3/checkout">
   with data/signature as hidden inputs and calls .submit() — browser
   navigates to LiqPay's hosted payment page. Cart is NOT cleared yet.
5. Buyer pays (or fails/abandons) on LiqPay's page.
6a. LiqPay redirects the browser to result_url. That page (app/checkout/result)
    calls GET /api/checkout/liqpay-status?paymentId=... — a READ-ONLY route that
    signs and POSTs an action:"status" request to LiqPay, and returns
    { status: "success" | "sandbox" | "pending" | "failure" }. This route never
    touches the CRM. On success/sandbox the page clears the cart and shows a
    confirmation message (no live order number — see "Why no instant order
    number" below). On failure, cart is left intact so the buyer can retry.
6b. Independently, LiqPay POSTs { data, signature } to server_url — the webhook,
    and the ONLY code path that creates a CRM order:
      - verify signature; reject (401, log) if it doesn't match
      - decode data; if status is not "success"/"sandbox", stop (no order)
      - decode `payload` from the request's own query string
      - re-check stock only (NOT price — price was already locked into the
        LiqPay charge at step 3) via getFreshProduct() per line
      - if every line is still in stock: createRemoteOrder(paymentId, lines,
        contact) with info.is_paid: true, payment_type: "LiqPay",
        order_text carrying LiqPay's transaction id
      - if any line sold out in the meantime: log critically (console.error
        with full context) and create nothing — see "Paid but unavailable"
        below. Respond 200 to LiqPay either way (no automatic retry contract
        is documented, so we don't rely on one).
```

### Why no instant order number

Approach chosen (of three considered — see chat log): the webhook is the **sole** order-creation trigger. This avoids two failure modes a redirect-triggers-creation design would have: double-creating an order if both paths fired, or silently losing a paid order if the buyer's browser never made it back to `result_url` (closed tab, lost connection, etc.). The cost is UX: the buyer doesn't see a CRM order number on the result page, only a "payment received, we're confirming your order" message. This is a smaller UX regression than it looks — the current unpaid flow already tells buyers the center follows up afterward.

### Idempotency without a database

`paymentId` is reused as **both** LiqPay's `order_id` and the CRM's `order_id`. If the webhook is delivered more than once (retry or replay), the second `createRemoteOrder` call collides with the CRM's own duplicate-`order_id` handling on the first attempt and errors — logged, not silently double-ordered. No separate dedup store needed.

### Payload integrity

Cart lines, contact, and the locked total travel in the `server_url` query string as base64url JSON — not in LiqPay's `info` field. This is a URL we construct and control, so there's nothing to verify about round-trip fidelity or size limits (a 20-item cart plus contact fields is comfortably under common URL length limits, roughly ~1–1.5KB before encoding). The actually-charged amount is attested by LiqPay's own signature over `data`; since we told LiqPay exactly what to charge at step 3 and never recompute a price at webhook time, there's no reconciliation step needed — only a stock re-check.

### Paid but unavailable

If stock changes between step 3 (charge initiated) and step 6b (webhook), the buyer has paid but no CRM order gets created. No refund flow exists in this codebase and none is being built here — this is a manual owner-reconciliation case, logged loudly per `checkout.md`'s existing rule ("a failed submit... must be loud... never swallowed"). Revisit only if this actually happens in practice.

## Files

| File | Change |
|------|--------|
| `lib/liqpay/client.ts` | New. `sign(data: string): string`, `buildCheckoutRequest(params): { data, signature }`, `verifyCallback(data, signature): boolean`, `checkStatus(orderId): Promise<LiqPayStatus>`. stdlib `crypto` (`sha1`) only — no new dependency. |
| `lib/liqpay/types.ts` | New. `LiqPayCallbackData`, `CheckoutPayload` (`{ lines, contact, total }`), `LiqPayStatus`. |
| `app/api/checkout/route.ts` | Modified. Keeps steps 1–2 of today's validation; replaces `createRemoteOrder` call with building and returning a LiqPay checkout request. |
| `app/api/checkout/liqpay-callback/route.ts` | New. The webhook (step 6b) — the only caller of `createRemoteOrder` in the paid flow. |
| `app/api/checkout/liqpay-status/route.ts` | New. Read-only status check (step 6a). |
| `app/checkout/result/page.tsx` | New. Renders the post-redirect confirmation/failure state. |
| `components/checkout/checkout-view.tsx` | Modified. Submit handler builds+submits the hidden LiqPay form instead of awaiting a synchronous order response; success screen moves to the new result page. |
| `lib/hugeprofit/orders.ts` | Modified. `buildOrderPayload` takes payment info (`is_paid`, `payment_type`, `order_text`) as a parameter instead of hardcoding the unpaid constant — the unpaid path is retired, LiqPay is the only checkout route going forward (see Non-goals). |

## Env vars

Server-only, same pattern as `HUGEPROFIT_API_KEY` (no `NEXT_PUBLIC_` prefix):

```
LIQPAY_PUBLIC_KEY=...
LIQPAY_PRIVATE_KEY=...
LIQPAY_SANDBOX=1   # optional; adds sandbox:1 to requests and accepts status "sandbox" as paid
```

## Non-goals

- No refund flow.
- No polling/retry UX on the result page beyond a single status check.
- No new test framework — this repo has none today; verification is `npm run build` plus manual sandbox runs (declined card, successful card, sold-out-during-payment). Sign/verify functions are pure stdlib code and cheap to unit-test later if a runner is ever introduced.

## Open items carried forward

- Sandbox verification of the two flagged assumptions above must happen before the rest of the design is trusted.

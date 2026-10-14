# LiqPay Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the already-written LiqPay integration from "compiles, never run" to "verified against LiqPay's sandbox and live on production", closing the one security hole found while reviewing it.

**Architecture:** No new subsystems. The payment flow built by the 2026-08-16 plan stays as-is: `POST /api/checkout` validates the cart and returns a signed LiqPay checkout request; the browser posts to LiqPay's hosted page; LiqPay's `server_url` webhook (`POST /api/checkout/liqpay-callback`) is the sole creator of CRM orders. This plan adds an HMAC tag to the payload that rides in the webhook's query string, then exercises the whole chain against a real LiqPay sandbox account through a public tunnel, then cuts over to live keys.

**Tech Stack:** Next.js 16 App Router route handlers, Node's built-in `crypto` (no new dependency). **There is no test framework in this repo and none is being added** (deliberate — see spec Non-goals; Node here is v20.19.0, which cannot run TypeScript directly, so `node --test` is not an option either). Verification is `npm run build` (the de-facto typecheck), runnable `curl` / `node -e` checks against `npm run dev`, and real sandbox payments.

**Spec:** `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`

## Global Constraints

- **No new npm dependencies.** Signing uses Node's stdlib `crypto`/`Buffer` only.
- **No database.** Payment-in-flight state travels in LiqPay's own request/callback round trip, never server storage.
- Env vars are server-only, no `NEXT_PUBLIC_` prefix: `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX` (`"1"` enables sandbox).
- **The webhook is the only code path allowed to call `createRemoteOrder`.** Nothing else creates CRM orders.
- `qty` is always `1` per work; `MAX_ITEMS = 20` caps cart size. Both unchanged.
- Comments: 2–3 lines max, constraints only — never narrate what the next lines do.
- **Never commit a tunnel URL, a sandbox key, or a live key.** `.env.local` is gitignored; `.env.example` carries placeholders only.
- CLAUDE.md rule: **`net_price` is the cost price and must never leave `lib/hugeprofit/`.** Nothing in this plan touches it — if a step tempts you to log a whole CRM product object, don't.

## Context: what already exists

Every file below is written, committed on `feat/payments`, and compiles. **None of it has ever run against a real LiqPay account or created a real CRM order.**

| File | Role |
|------|------|
| `lib/liqpay/client.ts` | `sign`, `buildCheckoutRequest`, `verifyCallback`, `decodeCallback`, `checkStatus` |
| `lib/liqpay/payload.ts` | `encodePayload` / `decodePayload` — base64url JSON, **currently unsigned** |
| `lib/liqpay/types.ts` | `LockedLine`, `CheckoutPayload`, `LiqPayCallbackData`, `LiqPayStatus` |
| `app/api/checkout/route.ts` | Validates cart against fresh CRM data, returns `{ checkoutUrl, data, signature }` |
| `app/api/checkout/liqpay-callback/route.ts` | The webhook — verifies LiqPay's signature, re-checks stock, creates the CRM order |
| `app/checkout/result/page.tsx` + `components/checkout/result-view.tsx` | Post-redirect status display, clears the cart on success |
| `lib/hugeprofit/orders.ts` | `createRemoteOrder` → `POST /bapi/remote_orders` |

Two source comments assert the untested state and must be corrected in Task 5 once they stop being true: `lib/liqpay/client.ts:5-8` and `lib/hugeprofit/orders.ts:5-9`.

## The security hole this plan closes

`app/api/checkout/route.ts:124` builds the webhook URL as:

```
${WEBSITE_URL}/api/checkout/liqpay-callback?payload=<base64url JSON of {paymentId, lines, contact}>
```

That query string alone decides what a paid CRM order contains, and **nothing authenticates it.** Commit `95ed4cd` added a `paymentId === callback.order_id` check, which stops binding one payment's payload to a *different* payment — but not a buyer forging the payload for *their own* payment.

The attack: LiqPay POSTs `{data, signature}` to `result_url` as well as `server_url`, so a buyer can obtain a valid, LiqPay-signed pair for a genuine ₴1 purchase they made. They then POST that same pair directly to `/api/checkout/liqpay-callback?payload=<forged>`, where the forged payload keeps `paymentId` equal to their real ₴1 `order_id` (passing the existing check) but names a ₴50 000 work. The webhook verifies LiqPay's signature — it is genuine — and creates a CRM order marked `is_paid: true`.

Fix: tag the payload with an HMAC keyed on `LIQPAY_PRIVATE_KEY` and verify it **before** anything else in the webhook. Task 1.

---

## Task 1: Sign the webhook payload

**Files:**
- Modify: `lib/liqpay/payload.ts` (full rewrite — it is 11 lines)
- Modify: `app/api/checkout/liqpay-callback/route.ts:14-16` and `:36`

**Interfaces:**
- Consumes: `CheckoutPayload` from `lib/liqpay/types.ts` (unchanged)
- Produces: `encodePayload(payload: CheckoutPayload): string` (unchanged signature, now returns `<body>.<tag>`), `decodePayload(encoded: string): CheckoutPayload | null` — **the return type gains `| null`**, which is the whole point; `app/api/checkout/liqpay-callback/route.ts` is the only caller.

- [ ] **Step 1: Confirm `decodePayload` has exactly one caller**

Run: `grep -rn "decodePayload\|encodePayload" --include="*.ts" --include="*.tsx" app lib components`

Expected: exactly six lines — the two definitions (`lib/liqpay/payload.ts:4`, `:8`), `encodePayload` imported and called in `app/api/checkout/route.ts` (`:4`, `:111`), and `decodePayload` imported and called in `app/api/checkout/liqpay-callback/route.ts` (`:4`, `:36`). If any other file calls `decodePayload`, stop: the `| null` return type change needs re-scoping to cover it.

- [ ] **Step 2: Rewrite `lib/liqpay/payload.ts`**

```ts
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CheckoutPayload } from './types'

function key(): string {
  const value = process.env.LIQPAY_PRIVATE_KEY
  if (!value) throw new Error('LIQPAY_PRIVATE_KEY is not set — add it to .env.local')
  return value
}

function tag(body: string): string {
  return createHmac('sha256', key()).update(body).digest('base64url')
}

/**
 * `<body>.<tag>`. The webhook URL is public and its payload alone decides what a
 * paid order contains, so it has to be tamper-evident — a buyer can otherwise
 * replay their own settled payment against a payload naming a different work.
 */
export function encodePayload(payload: CheckoutPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${tag(body)}`
}

/** `null` means forged, truncated or malformed — the caller must not proceed. */
export function decodePayload(encoded: string): CheckoutPayload | null {
  const [body, mac] = encoded.split('.')
  if (!body || !mac) return null

  const expected = Buffer.from(tag(body))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Verify the payload signature before anything else in the webhook**

In `app/api/checkout/liqpay-callback/route.ts`, replace lines 14–16:

```ts
  const { searchParams } = new URL(request.url)
  const encodedPayload = searchParams.get('payload')
  if (!encodedPayload) return new NextResponse(null, { status: 400 })
```

with:

```ts
  const { searchParams } = new URL(request.url)
  const encodedPayload = searchParams.get('payload')
  if (!encodedPayload) return new NextResponse(null, { status: 400 })

  // Checked before LiqPay's own signature: this query string is public and it
  // alone decides what a paid order contains, so a bad tag is not worth a
  // round trip through decodeCallback.
  const payload = decodePayload(encodedPayload)
  if (!payload) {
    console.error('[liqpay-callback] payload signature mismatch')
    return new NextResponse(null, { status: 400 })
  }
```

- [ ] **Step 4: Use the already-decoded payload instead of decoding again**

In the same file, replace line 36:

```ts
    const { paymentId, lines: locked, contact } = decodePayload(encodedPayload)
```

with:

```ts
    const { paymentId, lines: locked, contact } = payload
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`

Expected: succeeds. If it reports that `payload` is possibly `null` at line 36, Step 3's guard was pasted in the wrong place — it must be above the `try` block, not inside it.

- [ ] **Step 6: Prove a forged payload is rejected**

The payload tag is verified before LiqPay's signature, so this needs no valid LiqPay credentials — only a running dev server.

Run, in one terminal: `npm run dev`

Run, in another:

```bash
curl -s -o /dev/null -w "forged=%{http_code}\n" -X POST \
  "http://localhost:3000/api/checkout/liqpay-callback?payload=eyJwYXltZW50SWQiOjF9.notavalidtag" \
  -d "data=x" -d "signature=y"
curl -s -o /dev/null -w "untagged=%{http_code}\n" -X POST \
  "http://localhost:3000/api/checkout/liqpay-callback?payload=eyJwYXltZW50SWQiOjF9" \
  -d "data=x" -d "signature=y"
curl -s -o /dev/null -w "missing=%{http_code}\n" -X POST \
  "http://localhost:3000/api/checkout/liqpay-callback" \
  -d "data=x" -d "signature=y"
```

Expected: `forged=400`, `untagged=400`, `missing=400`, and `[liqpay-callback] payload signature mismatch` logged twice (not three times — the missing case returns before the tag check). A `500` on any of them means `LIQPAY_PRIVATE_KEY` is absent from `.env.local`; set any non-empty placeholder value and re-run — Task 2 replaces it with a real key.

- [ ] **Step 7: Commit**

```bash
git add lib/liqpay/payload.ts app/api/checkout/liqpay-callback/route.ts
git commit -m "fix: authenticate the webhook payload with an HMAC tag"
```

---

## Task 2: Sandbox credentials, tunnel, and first payment page

This task's deliverable is narrow and worth its own gate: **LiqPay accepts our signed request and renders a payment page.** That single outcome validates both of the spec's flagged assumptions — the signature algorithm and that `amount` is in major currency units (₴, not kopiyky). If `amount` were wrong by 100×, the payment page shows it.

**Files:**
- Modify: `.env.local` (gitignored — never committed)
- No source changes unless a check fails.

- [ ] **Step 1: Get LiqPay sandbox keys**

In the LiqPay merchant dashboard, switch the account to sandbox mode and copy the sandbox `public_key` / `private_key` pair (they are prefixed `sandbox_`).

- [ ] **Step 2: Start a public tunnel to the dev server**

LiqPay's servers must be able to reach `server_url`, and `localhost` is not reachable. Start a tunnel:

Run: `npx cloudflared tunnel --url http://localhost:3000`

Expected: prints a `https://<random-words>.trycloudflare.com` URL. (`npx ngrok http 3000` works too but now requires a free account and an authtoken; cloudflared needs neither.) Leave this running for Tasks 2–4.

- [ ] **Step 3: Point `.env.local` at the tunnel**

Set these in `.env.local`, keeping `HUGEPROFIT_API_KEY` as it already is:

```bash
WEBSITE_URL=https://<random-words>.trycloudflare.com
LIQPAY_PUBLIC_KEY=sandbox_...
LIQPAY_PRIVATE_KEY=sandbox_...
LIQPAY_SANDBOX=1
```

`lib/site.ts` reads `WEBSITE_URL` at module load, so **restart `npm run dev`** after editing. Write down the previous `WEBSITE_URL` value — Task 5 restores it.

- [ ] **Step 4: Confirm the tunnel actually reaches the app**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<random-words>.trycloudflare.com/shop`

Expected: `200`. Anything else means LiqPay's webhook will never arrive either — fix the tunnel before paying for anything.

- [ ] **Step 5: Reach LiqPay's payment page**

Open the tunnel URL in a browser, add one work to the cart, go to `/checkout`, fill the form, submit.

Expected: the browser navigates to a `liqpay.ua`-hosted payment page. **Read the amount printed on that page and confirm it equals the cart subtotal in hryvnia** — e.g. a ₴1 250 work shows `1 250,00 ₴`, not `12,50 ₴` and not `125 000 ₴`.

If LiqPay shows a signature error instead of a payment form, `sign()` in `lib/liqpay/client.ts:28-31` disagrees with LiqPay's current algorithm — recheck it against LiqPay's docs before continuing; every later task depends on it.

If the amount is off by 100×, `amount` is not in major units: divide by 100 at `app/api/checkout/route.ts:121` where `amount: total` is passed, and re-run this step.

- [ ] **Step 6: Record the outcome in the spec's open items**

In `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`, replace the `## Open items carried forward` section (line 116–119) with:

```markdown
## Open items carried forward

- ~~Sandbox verification of the two flagged assumptions above must happen before the rest of the design is trusted.~~ **Done 2026-09-06:** signature algorithm and `amount`-in-major-units both confirmed against a LiqPay sandbox account.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-liqpay-payment-design.md
git commit -m "docs: mark LiqPay's flagged assumptions sandbox-verified"
```

---

## Task 3: Full sandbox happy path

This is the first time `POST /bapi/remote_orders` is ever called for real. The account had zero remote orders as of 2026-08-12, so the field shapes in `buildOrderPayload` (`product_id: null` + `local_product_id`) are still API-docs-derived guesses.

**Files:**
- No planned source changes. Fix whatever this task breaks, in the file it breaks in.

- [ ] **Step 1: Pay with LiqPay's sandbox test card**

With the tunnel and dev server still running, repeat the checkout from Task 2 and complete payment using LiqPay's sandbox test card: `4242 4242 4242 4242`, any future expiry, any CVV.

Expected: payment completes on LiqPay's page.

- [ ] **Step 2: Confirm the buyer's return journey works**

Expected: the browser lands on `/checkout/result?paymentId=...` showing the success message ("Дякуємо!"), and the cart badge in the header drops to 0.

**Known risk to check here:** LiqPay POSTs to `result_url`, and `app/checkout/result/page.tsx` is a Next page, which answers GET only. If the buyer sees a **405** instead of the success message, the fix is to make `result_url` an API route that redirects to the page — create `app/api/checkout/result/route.ts`:

```ts
import { NextResponse } from 'next/server'

/** LiqPay POSTs the buyer back; a page route answers GET only, so bounce it. */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const paymentId = searchParams.get('paymentId') ?? ''
  return NextResponse.redirect(new URL(`/checkout/result?paymentId=${paymentId}`, request.url), 303)
}
```

and change `resultUrl` in `app/api/checkout/route.ts:123` to `${WEBSITE_URL}/api/checkout/result?paymentId=${paymentId}`. Then re-run Steps 1–2. Commit that as `fix: accept LiqPay's POST back to result_url` before continuing.

- [ ] **Step 3: Confirm the webhook ran clean**

Check the terminal running `npm run dev`.

Expected: **no `[liqpay-callback]` lines at all.** Every log line in that handler is an error path — silence is success. If you see `payload signature mismatch`, LiqPay mangled the query string (Task 1's tag is correct, so suspect URL encoding); if you see `paid order not created — stock changed`, the work sold in the CRM between the two checks; if you see `processing failed`, read the attached error — this is most likely the CRM rejecting the order payload, which Step 4 will confirm.

- [ ] **Step 4: Confirm the order landed in the CRM**

Open `https://crm.h-profit.com` and find the new remote order.

Expected: it exists, with the right buyer name/phone/email/address, the correct line item and price, total in UAH, `status: "pending"`, and `info.is_paid: true` with `payment_type: "LiqPay"`.

If the order is missing or its line items are empty/wrong, the `order_data` shape in `lib/hugeprofit/orders.ts:93-106` is wrong. The most likely culprit is the `product_id: null` + `local_product_id` pairing — try sending the numeric product id as `product_id` instead. Fix, re-run Steps 1–4, and commit the fix separately.

- [ ] **Step 5: Confirm stock decremented**

Reload the work's page on the tunnel URL after the 5-minute catalog cache expires (or check the CRM directly).

Expected: the work is no longer in stock. This confirms `reservedProducts` behaved as the API docs describe. If stock did **not** move, note it — it means a paid work stays purchasable, and the owners need to know that reservation is manual.

- [ ] **Step 6: Commit any fixes this task produced**

If Steps 1–5 needed no source change, skip this step and commit nothing.

```bash
git add -A
git status
git commit -m "fix: <what the live CRM/LiqPay round trip actually required>"
```

Review `git status` output before committing — `.env.local` must not appear (it is gitignored; if it shows up, stop and fix `.gitignore` before doing anything else).

---

## Task 4: Sandbox failure paths

The happy path is the cheap half. These three cases decide whether a failure costs the owners money or just an apology.

**Files:**
- No planned source changes.

- [ ] **Step 1: Abandon a payment**

Start a checkout, reach LiqPay's page, then close the tab without paying. Return to the site.

Expected: **no CRM order** was created, and the cart still holds the work. (LiqPay's sandbox may also document a declining test card — if it does, run that too; abandonment exercises the same two assertions and is always available.)

- [ ] **Step 2: Confirm a failed status renders as failure, not success**

Visit `https://<tunnel>/checkout/result?paymentId=1` (an id that was never paid).

Expected: the "Оплата не пройшла" failure view or the "Перевіряємо оплату…" pending view — **never** the success view, and the cart is **not** cleared. `checkStatus` returns `unknown` for an id LiqPay has no record of, which `ResultView` renders as pending.

- [ ] **Step 3: Confirm a duplicate webhook does not double-order**

LiqPay may redeliver. Simulate it by replaying the exact webhook LiqPay already sent for the Task 3 order — easiest is to pay again in sandbox and watch the logs, but the cheap version is to confirm the guard exists: the CRM rejects a second order with the same `order_id`, and `crmPost` throws, which the handler's `catch` logs as `processing failed`.

Expected: exactly one order in the CRM for that `order_id`. If a second order appears, the CRM does **not** enforce unique `order_id` and the spec's "Idempotency without a database" claim (line 75–77) is false — stop and raise it, because that is a design-level problem this plan cannot paper over.

- [ ] **Step 4: Record what the failure paths actually did**

In `.claude/docs/domain/checkout.md`, find the section describing the LiqPay flow and add a verification note stating the date (2026-09-06), that a sandbox payment created a real CRM order end to end, and the observed behaviour of abandonment and duplicate delivery. Keep it to a short paragraph — this doc records rules, not test logs.

- [ ] **Step 5: Commit**

```bash
git add .claude/docs/domain/checkout.md
git commit -m "docs: record the sandbox verification of the LiqPay flow"
```

---

## Task 5: Production cutover and truth-up

**Files:**
- Modify: `lib/liqpay/client.ts:5-8` (comment)
- Modify: `lib/hugeprofit/orders.ts:5-9` (comment)
- Modify: `CLAUDE.md`
- Modify: `.env.local` (restore — never committed)
- Vercel project settings (no file)

- [ ] **Step 1: Restore local env**

Put `WEBSITE_URL` in `.env.local` back to the value recorded in Task 2 Step 3, and stop the tunnel. **Do not leave a `trycloudflare.com` URL in any file.**

Run: `grep -rn "trycloudflare\|ngrok" --include="*.ts" --include="*.tsx" --include="*.md" . --exclude-dir=node_modules --exclude-dir=.git`

Expected: matches only inside this plan document. Anything else is a leaked tunnel URL — remove it.

- [ ] **Step 2: Correct the two "never exercised" comments**

In `lib/liqpay/client.ts`, replace lines 5–8:

```ts
/**
 * Signature algorithm and endpoints per LiqPay's published PHP SDK —
 * see spec for sourcing. Not yet exercised against a live account.
 */
```

with:

```ts
/**
 * Signature algorithm and endpoints per LiqPay's published PHP SDK, verified
 * against a sandbox account 2026-09-06. `amount` is in major units (₴).
 */
```

In `lib/hugeprofit/orders.ts`, replace lines 5–9:

```ts
/**
 * Order creation against `POST /bapi/remote_orders`. Field shapes are from the
 * API docs — this endpoint has never been exercised against the live account,
 * which had zero remote orders as of 2026-08-12.
 */
```

with:

```ts
/**
 * Order creation against `POST /bapi/remote_orders`, verified end to end from a
 * LiqPay sandbox payment on 2026-09-06 — the field shapes below are confirmed,
 * not docs-derived guesses.
 */
```

- [ ] **Step 3: Typecheck and commit the truth-up**

Run: `npm run build`

Expected: succeeds (comment-only changes).

```bash
git add lib/liqpay/client.ts lib/hugeprofit/orders.ts
git commit -m "docs: comments now reflect the sandbox-verified payment path"
```

- [ ] **Step 4: Set the production env vars in Vercel**

In the Vercel project settings → Environment Variables, for the **Production** environment:

| Key | Value |
|-----|-------|
| `WEBSITE_URL` | `https://plaipich.art` |
| `LIQPAY_PUBLIC_KEY` | the **live** public key (no `sandbox_` prefix) |
| `LIQPAY_PRIVATE_KEY` | the **live** private key |
| `HUGEPROFIT_API_KEY` | unchanged, already set |

**Do not set `LIQPAY_SANDBOX`.** Its absence is what makes payments real; `isSandbox()` (`lib/liqpay/client.ts:24-26`) only returns true for the exact string `"1"`.

`WEBSITE_URL` is the single most dangerous value here — `server_url` is built from it (`app/api/checkout/route.ts:124`). If it is wrong or missing, LiqPay charges the buyer and the webhook lands nowhere, producing paid orders that never reach the CRM.

- [ ] **Step 5: Deploy and verify the origin baked into the build**

Merge `feat/payments` to `master` and let Vercel deploy, then:

Run: `curl -s https://plaipich.art/sitemap.xml | head -5`

Expected: URLs beginning `https://plaipich.art`, not `http://localhost:3000` and not a tunnel host. The sitemap and `server_url` read the same `WEBSITE_URL`, so this is a cheap proxy for "the webhook URL is correct".

- [ ] **Step 6: Make one real payment**

Buy the cheapest work in the shop with a real card, through production.

Expected: the result page confirms payment, and a real CRM order appears with `info.is_paid: true`. Then ask the owners to refund it through the LiqPay dashboard and cancel the CRM order — there is no refund flow in this codebase and none is being built (spec Non-goals).

- [ ] **Step 7: Update `CLAUDE.md` to describe a live payment flow**

Two edits:

In the **Current state** paragraph, replace:

> Checkout creates real CRM orders, unpaid — the owners follow up to arrange payment (decided 2026-08-12). Still mock or missing: events (`lib/data.ts` → Google Calendar), artist bios (`artistProfiles`, empty), and online payment.

with:

> Checkout takes real payment through LiqPay and creates the CRM order from the payment webhook, verified end to end on 2026-09-06. Still mock or missing: events (`lib/data.ts` → Google Calendar) and artist bios (`artistProfiles`, empty).

In the **Scope / Requirements** list, replace item 6:

> 6. **Online payment** — a Ukrainian payment provider (LiqPay / monobank / Fondy / WayForPay — which one is not decided yet). Checkout must be structured so the payment step runs before order creation in the CRM.

with:

> 6. **Online payment** — BUILT: LiqPay hosted checkout. Payment settles before the CRM order is created; the `server_url` webhook is the only code path that creates one.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record LiqPay checkout as live and verified"
```

---

## What this plan deliberately does not do

- **No refund flow.** Spec Non-goals. A paid-but-sold-out order still logs loudly and waits for a human (`app/api/checkout/liqpay-callback/route.ts:48-56`).
- **No amount cross-check in the webhook.** Once the payload is HMAC-tagged (Task 1), the payload's line prices and the `amount` sent to LiqPay both derive from the same array in the same request and cannot diverge. Add one only if Task 3 shows LiqPay settling a different amount than requested.
- **No retry/polling UX on the result page.** One status check, as specced.
- **No test framework.** Node 20 cannot run TS directly and the repo has no runner; adding one is a separate decision, not a go-live blocker.

## Self-Review Notes

- **Spec coverage:** the spec's only carried-forward open item (sandbox verification of the two flagged assumptions) is Task 2. Its Non-goals are respected and restated above. The security hole in Task 1 is *not* in the spec — it was found reading the shipped code, and is documented in its own section so the fix argues from evidence rather than assertion.
- **Type consistency:** `decodePayload` gains `| null`; Step 1 of Task 1 confirms the single caller, and Steps 3–4 update it in the same task, so no task ever leaves the build broken.
- **No placeholders:** every step has real code, a real command with an expected result, or an exact document edit. The one intentional blank is `<random-words>.trycloudflare.com`, which cannot be known before Task 2 Step 2 generates it.
- **Ordering rationale:** Task 1 lands before any real key exists, so the hole is never open on a system holding live credentials. Tasks 2→3→4 escalate cost of failure (payment page → real CRM write → failure paths) so the cheapest check fails first. Task 5 only runs once all three pass.

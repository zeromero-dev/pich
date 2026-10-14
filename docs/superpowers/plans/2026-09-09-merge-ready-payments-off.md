# Merge-Ready Branch With Payments Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `feat/payments` safe to merge and deploy to production before LiqPay goes live, and exercise LiqPay in sandbox on a real Vercel Preview deployment.

**Architecture:** One switch, derived from configuration rather than a new flag: when `LIQPAY_PUBLIC_KEY` and `LIQPAY_PRIVATE_KEY` are both absent, payments are off. `/api/checkout` answers 503 instead of throwing, the checkout form shows a written explanation in both locales, and `/checkout/result` stops calling LiqPay. Adding the two keys in Vercel turns payments on with a redeploy — no code change, no second deploy path. A Preview deployment carries sandbox keys plus `CRM_WAREHOUSE_ID=51630`, so the full payment chain runs against mock stock on a public URL.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vercel (Hobby). No new dependencies. No test framework in this repo and none is being added; verification is `npm run build`, `curl` against `npm run dev`, and a sandbox purchase on the Preview URL.

**Spec:** `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`

**Follows:** `docs/superpowers/plans/2026-09-07-liqpay-dev-shop-rehearsal.md` (complete). **Precedes:** `docs/superpowers/plans/2026-09-09-liqpay-production-cutover.md`, which turns payments on for real.

## Global Constraints

- **No new npm dependencies. No database. No test framework.**
- Env vars are server-only — no `NEXT_PUBLIC_` prefix on any of them, ever.
- **`CRM_WAREHOUSE_ID` must be set in every environment** — `51630` (mock) on Preview and locally, `34998` on Production. Never defaulted; unset or non-numeric throws at import (`lib/hugeprofit/client.ts:13-30`). Nothing in code knows which warehouse is real, so a wrong value on Production serves the wrong stock without any error — check the value, not just its presence.
- **`LIQPAY_SANDBOX` must never exist in the Production environment.** `crmPost` refuses every CRM write while it is `"1"` on `VERCEL_ENV=production`.
- **The webhook is the only code path allowed to call `createRemoteOrder`.** Nothing else creates CRM orders.
- `net_price` is the CRM's cost price and must never leave `lib/hugeprofit/`.
- Comments: 2–3 lines max, constraints only — never narrate what the next lines do.
- **Never commit a key or `.env.local`.** Check `git status` before every commit.
- UI strings live in `lib/i18n.ts` with a UA and an EN entry for every key. No user-facing English-only strings.

## Why the branch is not merge-ready today

`POST /api/checkout` reaches `encodePayload` at `app/api/checkout/route.ts:111`, which calls `key()` in `lib/liqpay/payload.ts` and throws when `LIQPAY_PRIVATE_KEY` is unset. Nothing catches it, so the route answers **500** and the buyer sees a generic failure. `app/checkout/result/page.tsx:17` has the same problem one step later: `checkStatus` needs both keys.

Before this branch, `master`'s checkout created unpaid CRM orders and worked without any LiqPay configuration. Merging as-is therefore replaces a working checkout with a 500 until the moment keys are added in Vercel.

## Three states after this plan

| Keys present | `LIQPAY_SANDBOX` | `CRM_WAREHOUSE_ID` | Behaviour |
|---|---|---|---|
| No | — | `34998` | Payments off. Checkout explains, nothing 500s. **Production after merge.** |
| Sandbox pair | `1` | `51630` | Full chain against mock stock. **Preview.** |
| Live pair | unset | `34998` | Real payments. **Production after the cutover plan.** |

## What this plan deliberately does not do

- **No feature-flag system.** The presence of credentials is the flag. A separate `PAYMENTS_ENABLED` variable would add a second source of truth that can disagree with the keys.
- **No hiding of the cart or checkout link.** The cart still works and `/checkout` still renders; the form explains why it cannot submit. Hiding entry points needs a server-to-client flag for a state that lasts days.
- **No change to the payment flow itself.** It is verified; this plan only adds the off state.
- **No production cutover.** That is `2026-09-09-liqpay-production-cutover.md`.

---

## Task 1: The payments-off switch

**Files:**
- Modify: `lib/liqpay/client.ts` (add one exported predicate)
- Modify: `app/api/checkout/route.ts:61-70` (early return)
- Modify: `app/checkout/result/page.tsx:17`
- Modify: `app/api/checkout/liqpay-callback/route.ts:12-15`
- Modify: `lib/i18n.ts:127` and `:262` (one new key per locale)
- Modify: `components/checkout/checkout-view.tsx:96-103` (map the new error)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `paymentsEnabled(): boolean` exported from `lib/liqpay/client.ts`, and the API error code `"payments_disabled"` returned with HTTP 503 from `POST /api/checkout`. Task 2 relies on both.

- [ ] **Step 1: Add the predicate**

In `lib/liqpay/client.ts`, directly below the `isSandbox()` function, add:

```ts
/**
 * Payments are off until both keys exist. The credentials are the flag —
 * a separate toggle could disagree with them, and this one cannot.
 */
export function paymentsEnabled(): boolean {
  return Boolean(process.env.LIQPAY_PUBLIC_KEY && process.env.LIQPAY_PRIVATE_KEY)
}
```

- [ ] **Step 2: Refuse checkout cleanly when payments are off**

In `app/api/checkout/route.ts`, add `paymentsEnabled` to the existing import from `@/lib/liqpay/client`:

```ts
import { buildCheckoutRequest, paymentsEnabled } from '@/lib/liqpay/client'
```

Then make it the first statement inside `export async function POST(request: Request) {`, above the `let body: unknown` line:

```ts
  // Payments off (no LiqPay keys). 503, not 500: the cart is valid, the site
  // just cannot take money yet — and this must never throw at a buyer.
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: 'payments_disabled' }, { status: 503 })
  }
```

- [ ] **Step 3: Stop the result page calling LiqPay when payments are off**

In `app/checkout/result/page.tsx`, change the import on line 2 to:

```ts
import { checkStatus, paymentsEnabled } from '@/lib/liqpay/client'
```

and replace line 17:

```ts
  const status = id ? await checkStatus(id) : 'unknown'
```

with:

```ts
  const status = id && paymentsEnabled() ? await checkStatus(id) : 'unknown'
```

`'unknown'` renders as the pending view (`components/checkout/result-view.tsx:24-25`), which never clears the cart and never claims success.

- [ ] **Step 4: Make the webhook inert rather than throwing**

In `app/api/checkout/liqpay-callback/route.ts`, add the import:

```ts
import { verifyCallback, decodeCallback, paymentsEnabled } from '@/lib/liqpay/client'
```

and insert as the first statement of `POST`, above `const { searchParams } = new URL(request.url)`:

```ts
  // No keys means no signature can be verified, so nothing here is trustworthy.
  if (!paymentsEnabled()) return new NextResponse(null, { status: 400 })
```

Without this, a stray callback reaches `decodePayload`, throws on the missing key, and returns 500 — which invites LiqPay to retry a request that can never succeed.

- [ ] **Step 5: Add the message in both locales**

In `lib/i18n.ts`, in the Ukrainian `checkout` block, add after the `errorGeneric` line (`:127`):

```ts
      errorPaymentsDisabled: 'Онлайн-оплата ще не працює. Напишіть нам — домовимося про оплату і передачу роботи.',
```

In the English `checkout` block, after its `errorGeneric` line (`:262`):

```ts
      errorPaymentsDisabled: 'Online payment is not live yet. Get in touch and we will arrange payment and handover.',
```

Both dictionaries are typed against the same shape, so a key added to one and not the other is a build error — which is the point.

- [ ] **Step 6: Show it in the form**

In `components/checkout/checkout-view.tsx`, replace the error mapping at lines 96–103:

```ts
        setSubmitError(
          body?.error === 'unavailable'
            ? t.checkout.errorUnavailable
            : body?.error === 'repriced'
              ? t.checkout.errorRepriced
              : t.checkout.errorGeneric,
        )
```

with:

```ts
        setSubmitError(
          body?.error === 'unavailable'
            ? t.checkout.errorUnavailable
            : body?.error === 'repriced'
              ? t.checkout.errorRepriced
              : body?.error === 'payments_disabled'
                ? t.checkout.errorPaymentsDisabled
                : t.checkout.errorGeneric,
        )
```

- [ ] **Step 7: Typecheck**

Run: `npm run build`

Expected: succeeds. A failure naming `errorPaymentsDisabled` means Step 5 added the key to one locale only.

- [ ] **Step 8: Prove the off state, with keys removed**

Copy `.env.local` aside, strip both LiqPay keys, and start the dev server:

```bash
cp .env.local /tmp/env.bak
grep -v '^LIQPAY_PUBLIC_KEY=\|^LIQPAY_PRIVATE_KEY=' /tmp/env.bak > .env.local
npm run dev
```

In a second terminal:

```bash
curl -s -o /dev/null -w "checkout=%{http_code}\n" http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"items":[{"workId":"9060539","qty":1,"price":340}],"contact":{"name":"T T","email":"t@e.com","phone":"+380990000000","city":"L","address":"A 1"}}'
curl -s -o /dev/null -w "result=%{http_code}\n" "http://localhost:3000/checkout/result?paymentId=1"
curl -s -o /dev/null -w "callback=%{http_code}\n" -X POST "http://localhost:3000/api/checkout/liqpay-callback?payload=x.y" -d "data=a" -d "signature=b"
curl -s -o /dev/null -w "shop=%{http_code}\n" http://localhost:3000/shop
```

Expected exactly: `checkout=503`, `result=200`, `callback=400`, `shop=200`. **Any 500 is a failure of this task** — that is the state being eliminated. Confirm the dev-server log shows no unhandled `LIQPAY_PUBLIC_KEY is not set` error.

- [ ] **Step 9: Prove the on state still works**

```bash
cp /tmp/env.bak .env.local
```

Restart `npm run dev`, then re-run the first curl from Step 8.

Expected: `checkout=200`. Payments with keys present are unchanged.

- [ ] **Step 10: Commit**

```bash
git add lib/liqpay/client.ts app/api/checkout/route.ts app/checkout/result/page.tsx app/api/checkout/liqpay-callback/route.ts lib/i18n.ts components/checkout/checkout-view.tsx
git status
git commit -m "feat: turn payments off cleanly when LiqPay keys are absent"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Task 2: Sandbox LiqPay on a Vercel Preview deployment

**Files:**
- Vercel project settings, **Preview** scope (no repo file).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/payments
```

Expected: Vercel starts a Preview deployment. If the project is not connected to the GitHub repository, connect it before continuing — everything else in this task depends on it.

- [ ] **Step 2: Find the stable branch URL**

In the Vercel dashboard, open the deployment and copy the **branch alias** — the URL containing the branch name rather than a per-deployment hash. Per-deployment URLs change on every push, and `WEBSITE_URL` must stay valid across pushes because `server_url` is built from it (`app/api/checkout/route.ts:124`).

- [ ] **Step 3: Set the Preview environment variables**

Vercel → Settings → Environment Variables, **Preview** scope only:

| Key | Value |
|-----|-------|
| `WEBSITE_URL` | the branch alias URL from Step 2, no trailing slash |
| `CRM_WAREHOUSE_ID` | `51630` |
| `HUGEPROFIT_API_KEY` | the dev-scoped token |
| `LIQPAY_PUBLIC_KEY` | the sandbox public key |
| `LIQPAY_PRIVATE_KEY` | the sandbox private key |
| `LIQPAY_SANDBOX` | `1` |

`CRM_WAREHOUSE_ID` and `LIQPAY_SANDBOX` are set **here and only here**. Production must not carry either.

- [ ] **Step 4: Redeploy so the variables take effect**

Vercel applies environment changes at build time, not at runtime. Redeploy the branch from the dashboard, or push an empty commit:

```bash
git commit --allow-empty -m "chore: redeploy preview with payment env"
git push
```

- [ ] **Step 5: Confirm the Preview serves mock stock**

```bash
curl -s https://<branch-alias>/shop | grep -c '\[DEV\]'
```

Expected: a number greater than 0 — the five imaged mock works. A `0` means `CRM_WAREHOUSE_ID` did not reach this deployment; recheck the scope in Step 3 and redeploy.

- [ ] **Step 6: Confirm the webhook URL points at the Preview host**

```bash
curl -s https://<branch-alias>/api/checkout -H "Content-Type: application/json" \
  -d '{"items":[{"workId":"9060539","qty":1,"price":340}],"contact":{"name":"Test Tester","email":"test@example.com","phone":"+380990000000","city":"Lviv","address":"Testova 1"}}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(JSON.parse(s).data&&Buffer.from(JSON.parse(s).data,'base64').toString());console.log('amount',p.amount,p.currency,'sandbox',p.sandbox);console.log('server_url',p.server_url.slice(0,80))})"
```

Expected: `amount 340 UAH sandbox 1`, and `server_url` beginning with the branch alias. If `server_url` names a per-deployment hash or `localhost`, `WEBSITE_URL` is wrong and LiqPay's webhook will not arrive.

Note: product `9060539` is `[DEV] Свічка «Тиха ніч»` and was **already bought** during the rehearsal, so its `instock` is 0 and this call may return `409 unavailable`. If it does, pick another from `/shop` — the assertion here is about `server_url`, so use whichever mock work is in stock.

- [ ] **Step 7: Buy a mock work end to end on the Preview URL**

Open the branch alias in a browser, add an in-stock `[DEV]` work to the cart, check out, and pay with LiqPay's sandbox test card `4242 4242 4242 4242`, any future expiry, any CVV.

Expected: the payment completes, the browser returns to `/checkout/result?paymentId=…` showing "Дякуємо!", and the cart badge drops to 0.

- [ ] **Step 8: Confirm the order reached the CRM from the deployed app**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const rs=JSON.parse(s).response;console.log('orders:',rs.length);const o=rs.sort((a,b)=>(a.date_created<b.date_created?1:-1))[0];console.log(JSON.stringify({order_id:o.order_id,price:o.price,info:o.info,line:o.order_data[0]},null,1))})"
```

Expected: one more order than before (three, if the rehearsal's two are still present), with `info.is_paid: true`, `payment_type: "LiqPay"`, and `order_data[0]` carrying `mid: "51630"` — the mock warehouse, never `34998`.

If Vercel's runtime logs show `[liqpay-callback]` lines, read them: this is the same diagnostic set the rehearsal used, and each line names its own cause.

- [ ] **Step 9: Nothing to commit**

This task changes no repository files beyond the optional empty commit in Step 4.

---

## Task 3: Merge to master and confirm production is safe with payments off

**Files:**
- Merge: `feat/payments` → `master`
- Modify: `CLAUDE.md` (current state paragraph, scope item 6)

- [ ] **Step 1: Confirm Production carries no test configuration**

In Vercel → Settings → Environment Variables, **Production** scope, confirm there is **no** entry for `LIQPAY_SANDBOX`, `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, or `DEV_ORIGIN`, and that `CRM_WAREHOUSE_ID=34998`, `WEBSITE_URL=https://plaipich.art` and a full-access `HUGEPROFIT_API_KEY` are present.

`LIQPAY_SANDBOX` would make `crmPost` refuse every write, and `CRM_WAREHOUSE_ID=51630` would serve the mock works as the shop with no error at all. The LiqPay keys being **absent** is what keeps payments off after the merge.

- [ ] **Step 2: Confirm the branch is clean and current**

```bash
git status --short
git rev-list --count HEAD..master
```

Expected: no output from the first, `0` from the second.

- [ ] **Step 3: Merge and push**

```bash
git checkout master
git merge feat/payments
git push origin master
```

**This is the irreversible, outward-facing step.** Confirm with the owners before running it.

- [ ] **Step 4: Confirm the production deployment built**

Open the Production deployment's build log in Vercel.

Expected: success. A failure naming `CRM_WAREHOUSE_ID` means it is missing from Production — set it to `34998` and redeploy; the error names its own remedy.

- [ ] **Step 5: Confirm production serves the real shop**

```bash
curl -s -o /dev/null -w "shop=%{http_code}\n" https://plaipich.art/shop
curl -s https://plaipich.art/shop | grep -c '\[DEV\]'
curl -s https://plaipich.art/sitemap.xml | head -3
```

Expected: `shop=200`, `0` mock rows, and sitemap URLs beginning `https://plaipich.art`.

- [ ] **Step 6: Confirm payments are off and nothing 500s**

```bash
curl -s -o /dev/null -w "checkout=%{http_code}\n" https://plaipich.art/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"items":[{"workId":"1","qty":1,"price":1}],"contact":{"name":"T T","email":"t@e.com","phone":"+380990000000","city":"L","address":"A 1"}}'
curl -s -o /dev/null -w "result=%{http_code}\n" "https://plaipich.art/checkout/result?paymentId=1"
```

Expected: `checkout=503` and `result=200`. The 503 arrives before any cart validation, which is why an invalid `workId` is fine here.

Then open `https://plaipich.art/checkout` in a browser with something in the cart and submit: the form must show "Онлайн-оплата ще не працює…" rather than a generic failure.

- [ ] **Step 7: Update `CLAUDE.md`**

In the **Current state** paragraph, replace:

> Checkout creates real CRM orders, unpaid — the owners follow up to arrange payment (decided 2026-08-12). Still mock or missing: events (`lib/data.ts` → Google Calendar), artist bios (`artistProfiles`, empty), and online payment.

with:

> Checkout is built on LiqPay and verified end to end in sandbox, but **payments are off in production**: with no LiqPay keys set, `/api/checkout` answers 503 and the form explains that online payment is not live yet. Adding the two keys in Vercel turns it on. Still mock or missing: events (`lib/data.ts` → Google Calendar) and artist bios (`artistProfiles`, empty).

In **Scope / Requirements**, replace item 6:

> 6. **Online payment** — a Ukrainian payment provider (LiqPay / monobank / Fondy / WayForPay — which one is not decided yet). Checkout must be structured so the payment step runs before order creation in the CRM.

with:

> 6. **Online payment** — BUILT: LiqPay hosted checkout, merged 2026-09-09 with payments off until the keys are set. Payment settles before the CRM order is created; the `server_url` webhook is the only code path that creates one. Credentials are the on/off switch — see `paymentsEnabled()` in `lib/liqpay/client.ts`.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git status
git commit -m "docs: record the merged payment flow and its off state"
git push origin master
```

---

## Self-Review Notes

- **Spec coverage:** the spec's payment-before-order rule is untouched — this plan adds an off state ahead of the flow, never a second order-creation path. Its Non-goals (no refund flow, no retry UX) are unaffected. The spec assumes credentials exist; the off state is new behaviour this plan introduces and documents, not a spec requirement it satisfies.
- **Type consistency:** `paymentsEnabled(): boolean` is defined in Task 1 Step 1 and used in Steps 2, 3 and 4 of the same task; the error code `"payments_disabled"` is produced in Step 2, mapped in Step 6, and asserted in Task 2 and Task 3. `errorPaymentsDisabled` is added to both locale blocks in one step, so the dictionaries never diverge across a commit.
- **No placeholders:** every step carries real code, a real command with its expected output, or an exact document edit. The runtime-resolved values are the Vercel branch alias (unknowable before Task 2 Step 2) and whichever mock work is in stock at Task 2 Step 7, which the step tells the operator how to pick.
- **Ordering rationale:** Task 1 is the only source change and is provable locally by removing keys, so it lands before anything is deployed. Task 2 proves the payment chain on a real deployment while production is still untouched. Task 3 merges only after both, and its Step 1 checks Production's configuration *before* the irreversible push rather than after.
- **Human-only steps:** all of Task 2's dashboard work and the browser purchase, plus Task 3 Steps 1, 3 and 6's browser check. Task 1 entirely, and the curl assertions in Tasks 2 and 3, are automatable.

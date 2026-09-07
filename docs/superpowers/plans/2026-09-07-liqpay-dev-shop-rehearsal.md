# LiqPay Dev-Shop Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the whole LiqPay payment chain end to end — payment page, webhook, real CRM order creation, failure paths — against the CRM's `dev` warehouse and its 50 mock products, so that not one real artwork is reserved, sold, or refunded during verification.

**Architecture:** No new subsystems and no change to the payment flow itself. One line in `lib/hugeprofit/client.ts` becomes environment-driven: `SHOP_WAREHOUSE_ID` reads `CRM_WAREHOUSE_ID` and falls back to the real shop warehouse. Setting `CRM_WAREHOUSE_ID=51630` in `.env.local` swings the entire site — catalog, product pages, checkout validation, and the webhook's stock re-check — onto the mock catalog, because all four already route through that one constant. Everything else in this plan is running the flow and reading what comes back.

**Tech Stack:** Next.js 16 App Router route handlers, Node's built-in `crypto` (no new dependency). **There is no test framework in this repo and none is being added** (deliberate — see spec Non-goals; Node here is v20.19.0, which cannot run TypeScript directly, so `node --test` is not an option). Verification is `npm run build` (the de-facto typecheck), runnable `curl` checks against `npm run dev`, and real sandbox payments.

**Spec:** `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`

**Supersedes:** Tasks 2–4 of `docs/superpowers/plans/2026-09-06-liqpay-go-live.md`, which halted un-run. Those tasks did the same verification against the **live shop warehouse**, i.e. by selling a real painting to a test card. This plan does it against mock stock instead. Task 5 of that plan (production cutover) is unchanged and still the next step after this one; **do not perform it as part of this plan.**

## Global Constraints

- **No new npm dependencies.** Signing uses Node's stdlib `crypto`/`Buffer` only.
- **No database.** Payment-in-flight state travels in LiqPay's own request/callback round trip, never server storage.
- Env vars are server-only, no `NEXT_PUBLIC_` prefix: `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX` (`"1"` enables sandbox), and the new `CRM_WAREHOUSE_ID`.
- **`CRM_WAREHOUSE_ID` must never be set in Vercel.** Its absence is what keeps production on the real shop. Setting it to `51630` in production would replace the shop with 50 mock rows.
- **The webhook is the only code path allowed to call `createRemoteOrder`.** Nothing else creates CRM orders.
- `qty` is always `1` per work; `MAX_ITEMS = 20` caps cart size. Both unchanged.
- Comments: 2–3 lines max, constraints only — never narrate what the next lines do.
- **Never commit a tunnel URL, a sandbox key, or a live key.** `.env.local` is gitignored (`.env*` at `.gitignore:34`); `.env.example` carries placeholders only.
- CLAUDE.md rule: **`net_price` is the cost price and must never leave `lib/hugeprofit/`.** Nothing in this plan touches it — if a step tempts you to log a whole CRM product object, don't.
- **`[DEV]` rows cannot be deleted via the API.** The HUGEPROFIT API has DELETE for categories, clients, sales, tags and sync-mappings, but not for products. Every mock row is permanent until someone removes it by hand in the CRM UI. Do not "clean up and retry" by creating a second batch.

## Context: what already exists

**Code.** Written, committed on `feat/payments`, and typechecking. The webhook payload is HMAC-tagged as of commit `a592cdb`.

| File | Role |
|------|------|
| `lib/liqpay/client.ts` | `sign`, `buildCheckoutRequest`, `verifyCallback`, `decodeCallback`, `checkStatus` |
| `lib/liqpay/payload.ts` | `encodePayload` / `decodePayload` — base64url JSON + HMAC-SHA256 tag |
| `app/api/checkout/route.ts` | Validates the cart against fresh CRM data, returns `{ checkoutUrl, data, signature }` |
| `app/api/checkout/liqpay-callback/route.ts` | The webhook — verifies the payload tag, then LiqPay's signature, re-checks stock, creates the CRM order |
| `app/checkout/result/page.tsx` + `components/checkout/result-view.tsx` | Post-redirect status display, clears the cart on success |
| `lib/hugeprofit/orders.ts` | `createRemoteOrder` → `POST /bapi/remote_orders` |

**CRM data.** Seeded 2026-09-07 into warehouse `dev` (`id 51630`): 50 products, every one named `[DEV] …`, SKU `DEV-*`, brand `DEV` (`brand_id 108410`), quantity 1, prices ₴260–₴12 000, filed under existing categories. Verified at seed time: zero of them carry stock in any other warehouse, and the real shop warehouse `34998` still reports exactly 258 rows.

Four of the cheapest, for use in the steps below:

| product_id | name | price | sku |
|---|---|---|---|
| 9054727 | `[DEV] Свічка фігурна «Спіраль»` | 260 | `DEV-KRSEAK` |
| 9054728 | `[DEV] Набір чайних свічок, 12 шт.` | 340 | `DEV-X8K946` |
| 9054701 | `[DEV] Листівки «Львівські дахи», набір 6 шт.` | 380 | `DEV-4S3185` |
| 9054724 | `[DEV] Свічка «Смерека»` | 420 | `DEV-0JIRQP` |

**Two blockers from the previous plan, re-checked 2026-09-07:**

1. `HUGEPROFIT_API_KEY` returning `403 not-correct-api-key` — **resolved.** `GET /bapi/products?count=1` now returns `200` with the key in `.env.local`.
2. No LiqPay sandbox credentials — **still open.** Task 3 Step 1 is where they get obtained; Tasks 3–5 cannot start without them.

## Why the warehouse constant is the whole trick

`lib/hugeprofit/index.ts` sends `warehouse_id: SHOP_WAREHOUSE_ID` on every product query and passes the same constant to `toProduct` to pick the stock row. Both halves currently say `34998`, and the CRM's filter is strict — verified 2026-09-07:

```
GET /bapi/products?product_id=9054668&warehouse_id=34998  →  {"data": []}
```

So a dev product is invisible to `getFreshProduct` today, and `POST /api/checkout` for one returns `409 unavailable`. Making that constant configurable is the only source change this plan needs; the webhook, the catalog and the product pages all follow it for free because they share it.

## What this plan deliberately does not do

- **No production cutover.** That is Task 5 of `2026-09-06-liqpay-go-live.md`, unchanged, and runs after this plan passes.
- **No refund flow.** Spec Non-goals. A paid-but-sold-out order still logs loudly and waits for a human (`app/api/checkout/liqpay-callback/route.ts:57-65`).
- **No deletion of the `[DEV]` rows.** No API exists for it; leave them, they are inert outside warehouse 51630.
- **No test framework.** Node 20 cannot run TS directly and the repo has no runner; adding one is a separate decision.
- **No image-upload path.** The CRM's product-create endpoint silently drops `images[]` and the API has no upload endpoint (verified 2026-09-07), so Task 2 adds them by hand in the CRM UI instead of automating it.

---

## Task 1: Make the shop warehouse configurable

**Files:**
- Modify: `lib/hugeprofit/client.ts:13-17`
- Modify: `.env.example`
- Modify: `CLAUDE.md` (env var list)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SHOP_WAREHOUSE_ID: number` — same name, same type, same import site (`lib/hugeprofit/index.ts:4`). No call signature changes anywhere, so no other file needs touching.

- [ ] **Step 1: Confirm the constant has exactly one definition and one importer**

Run: `grep -rn "SHOP_WAREHOUSE_ID" --include="*.ts" --include="*.tsx" app lib components`

Expected: six lines — the definition at `lib/hugeprofit/client.ts:17`, the import at `lib/hugeprofit/index.ts:4`, and four uses in `lib/hugeprofit/index.ts` (`:19`, `:36`, `:103`, `:116`). If any other file defines or hardcodes `34998`, stop and widen this task to cover it.

- [ ] **Step 2: Make the constant environment-driven**

In `lib/hugeprofit/client.ts`, replace lines 13–17:

```ts
/**
 * "Крамничка ПІЧ". The account also has "Події в ПІЧі" (35002), empty today;
 * filtering keeps non-shop stock out of the catalog if it ever gets used.
 */
export const SHOP_WAREHOUSE_ID = 34998
```

with:

```ts
/**
 * "Крамничка ПІЧ" (34998). The account also has "Події в ПІЧі" (35002) and the
 * mock "dev" warehouse (51630); `CRM_WAREHOUSE_ID` swings the whole site onto
 * one of those for payment testing. Never set it in production.
 */
const configuredWarehouse = Number(process.env.CRM_WAREHOUSE_ID)
export const SHOP_WAREHOUSE_ID =
  Number.isInteger(configuredWarehouse) && configuredWarehouse > 0 ? configuredWarehouse : 34998
```

The guard matters: `Number(undefined)` is `NaN` and `Number('')` is `0`, and either one reaching the CRM as `warehouse_id` returns an empty catalog — an entirely blank shop rather than a visible error.

- [ ] **Step 3: Document the variable in `.env.example`**

In `.env.example`, add this line directly below the `HUGEPROFIT_API_KEY` line:

```bash
# CRM_WAREHOUSE_ID=51630           # optional — swings the catalog onto the mock "dev" warehouse. NEVER set in production.
```

Leave it commented out. An empty `CRM_WAREHOUSE_ID=` would be `Number('') === 0`, which the Step 2 guard rejects, but a commented line states the intent better.

- [ ] **Step 4: Document the variable in `CLAUDE.md`**

In `CLAUDE.md`, in the fenced env block under "Development Commands", add this line directly below `HUGEPROFIT_API_KEY=...`:

```bash
CRM_WAREHOUSE_ID=51630            # optional, local only — points the catalog at the mock "dev" warehouse
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`

Expected: succeeds, including the static page-data collection phase (this is the phase that failed with `CrmError: CRM products responded 403` before the API key was fixed; it must pass now). If it fails with a 403, the CRM key has been rejected again — stop and resolve that before any later task, because Tasks 3–5 all need working CRM reads and writes.

- [ ] **Step 6: Prove the override actually reaches the CRM**

Set `CRM_WAREHOUSE_ID=51630` in `.env.local`, then run `npm run dev` (a change to `.env.local` needs a restart — `SHOP_WAREHOUSE_ID` is evaluated at module load).

Run:

```bash
curl -s http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"items":[{"workId":"9054727","qty":1,"price":260}],"contact":{"name":"Тест Тестенко","email":"test@example.com","phone":"+380990000000","city":"Львів","address":"вул. Тестова 1"}}' \
  | head -c 300
```

Expected: a JSON body containing `"checkoutUrl":"https://www.liqpay.ua/api/3/checkout"` plus `data` and `signature`. The signature will be junk if `LIQPAY_PRIVATE_KEY` is still a placeholder — that is fine here; this step asserts only that the mock product validated as purchasable.

A `409 {"error":"unavailable","unavailable":["9054727"]}` means the override did not take effect: `.env.local` was not saved, or the dev server was not restarted.

- [ ] **Step 7: Prove the default is unchanged**

Comment out `CRM_WAREHOUSE_ID` in `.env.local`, restart `npm run dev`, and re-run the exact curl from Step 6.

Expected: `409` with `{"error":"unavailable","unavailable":["9054727"]}` — the dev product is correctly invisible when the override is absent. This is the check that proves production behaviour did not move.

Then set `CRM_WAREHOUSE_ID=51630` again and restart; Tasks 2–5 all run with it set.

- [ ] **Step 8: Commit**

```bash
git add lib/hugeprofit/client.ts .env.example CLAUDE.md
git status
git commit -m "feat: allow the catalog warehouse to be overridden for payment testing"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Task 2: Make the mock catalog browsable

The 50 seeded products have **no images**, and `isSellable` (`lib/hugeprofit/index.ts:26-28`) drops any product with an empty `images[]`, by design: "a work with no photograph has nothing to sell". That filter runs in `getCatalog` and `getProductBySlug`, so with no images the mock shop renders zero works and no browser checkout is possible. `getFreshProduct` does **not** filter, which is why Task 1 Step 6 worked over the API.

Three images are enough for every later task. This is a human step in the CRM UI — the API cannot do it.

**Files:**
- No source changes. CRM UI only.

- [ ] **Step 1: Add a photo to three dev products in the CRM UI**

Open `https://crm.h-profit.com`, find these three products by SKU, and upload any image to each (a placeholder photo is fine — nothing here is customer-facing):

| sku | name | price |
|---|---|---|
| `DEV-KRSEAK` | `[DEV] Свічка фігурна «Спіраль»` | 260 |
| `DEV-X8K946` | `[DEV] Набір чайних свічок, 12 шт.` | 340 |
| `DEV-4S3185` | `[DEV] Листівки «Львівські дахи», набір 6 шт.` | 380 |

- [ ] **Step 2: Confirm the CRM now returns image URLs for them**

Run:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?product_id=9054727&warehouse_id=51630"
```

(If `$HUGEPROFIT_API_KEY` is not exported in your shell, read it from `.env.local` — do not paste it into a file or a commit message.)

Expected: the returned object's `images` array holds at least one `https://crm.h-profit.com/bimages/get/...` URL. An empty array means the CRM UI upload did not save; retry it before continuing, because every later task needs a browser cart.

- [ ] **Step 3: Confirm the mock shop renders**

With `CRM_WAREHOUSE_ID=51630` set and `npm run dev` running, open `http://localhost:3000/shop`. The catalog is cached for 5 minutes (`CATALOG_REVALIDATE`), so restarting the dev server is the fastest way to see fresh data.

Expected: exactly the three products from Step 1 appear, priced ₴260 / ₴340 / ₴380, each under its `[DEV]` name and attributed to artist `DEV`. Clicking one opens its product page, and "Додати в кошик" puts it in the cart.

If the grid is empty, the catalog cache is stale — restart `npm run dev` and reload.

- [ ] **Step 4: Nothing to commit**

This task changes no files. Do not commit.

---

## Task 3: Sandbox credentials, tunnel, and payment page

This task's deliverable is narrow and worth its own gate: **LiqPay accepts our signed request and renders a payment page for a mock work.** That single outcome validates both of the spec's flagged assumptions — the signature algorithm, and that `amount` is in major currency units (₴, not kopiyky). If `amount` were wrong by 100×, the payment page shows it.

**Files:**
- Modify: `.env.local` (gitignored — never committed)
- No source changes unless a check fails.

- [ ] **Step 1: Get LiqPay sandbox keys**

In the LiqPay merchant dashboard, switch the account to sandbox mode and copy the sandbox `public_key` / `private_key` pair (they are prefixed `sandbox_`).

- [ ] **Step 2: Start a public tunnel to the dev server**

LiqPay's servers must reach `server_url`, and `localhost` is not reachable from them.

Run: `npx cloudflared tunnel --url http://localhost:3000`

Expected: prints a `https://<random-words>.trycloudflare.com` URL. (`npx ngrok http 3000` works too but now requires an account and authtoken; cloudflared needs neither.) Leave this running for Tasks 3–5.

- [ ] **Step 3: Point `.env.local` at the tunnel**

Set these in `.env.local`, keeping `HUGEPROFIT_API_KEY` as it already is:

```bash
WEBSITE_URL=https://<random-words>.trycloudflare.com
CRM_WAREHOUSE_ID=51630
LIQPAY_PUBLIC_KEY=sandbox_...
LIQPAY_PRIVATE_KEY=sandbox_...
LIQPAY_SANDBOX=1
```

`lib/site.ts` reads `WEBSITE_URL` at module load, so **restart `npm run dev`** after editing. Write down the previous `WEBSITE_URL` value — Task 6 restores it.

- [ ] **Step 4: Confirm the tunnel reaches the app**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<random-words>.trycloudflare.com/shop`

Expected: `200`. Anything else means LiqPay's webhook will never arrive either — fix the tunnel before paying for anything.

- [ ] **Step 5: Reach LiqPay's payment page**

Open the tunnel URL in a browser, add `[DEV] Свічка фігурна «Спіраль»` (₴260) to the cart, go to `/checkout`, fill the form with any plausible contact details, and submit.

Expected: the browser navigates to a `liqpay.ua`-hosted payment page. **Read the amount printed on that page and confirm it says `260,00 ₴`** — not `2,60 ₴` and not `26 000 ₴`.

If LiqPay shows a signature error instead of a payment form, `sign()` (`lib/liqpay/client.ts:28-31`) disagrees with LiqPay's current algorithm — recheck it against LiqPay's docs before continuing; every later task depends on it.

If the amount is off by 100×, `amount` is not in major units: divide by 100 at `app/api/checkout/route.ts:121` where `amount: total` is passed, re-run this step, and commit that fix separately as `fix: send LiqPay the amount in kopiyky`.

- [ ] **Step 6: Record the outcome in the spec's open items**

In `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`, replace the `## Open items carried forward` section with:

```markdown
## Open items carried forward

- ~~Sandbox verification of the two flagged assumptions above must happen before the rest of the design is trusted.~~ **Done 2026-09-07:** signature algorithm and `amount`-in-major-units both confirmed against a LiqPay sandbox account, buying a mock work from the CRM's `dev` warehouse.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-liqpay-payment-design.md
git commit -m "docs: mark LiqPay's flagged assumptions sandbox-verified"
```

---

## Task 4: Full sandbox happy path against the dev warehouse

This is the first time `POST /bapi/remote_orders` is ever called for real — `GET /bapi/remote_orders` returned `{"success": true, "response": []}` on 2026-09-07, so the account has never held one. The field shapes in `buildOrderPayload` (`lib/hugeprofit/orders.ts:93-106`) are still API-docs-derived guesses, and this task turns them into facts. Getting it wrong costs a junk order against a ₴260 mock candle instead of a real painting.

**Files:**
- No planned source changes. Fix whatever this task breaks, in the file it breaks in.

- [ ] **Step 1: Pay with LiqPay's sandbox test card**

With the tunnel and dev server still running, repeat the checkout from Task 3 Step 5 and complete payment with LiqPay's sandbox test card: `4242 4242 4242 4242`, any future expiry, any CVV.

Expected: payment completes on LiqPay's page.

- [ ] **Step 2: Confirm the buyer's return journey works**

Expected: the browser lands on `/checkout/result?paymentId=...` showing the success message ("Дякуємо!"), and the cart badge in the header drops to 0.

**Known risk to check here:** LiqPay POSTs to `result_url`, and `app/checkout/result/page.tsx` is a Next page, which answers GET only. If the buyer sees a **405** instead of the success message, create `app/api/checkout/result/route.ts`:

```ts
import { NextResponse } from 'next/server'

/** LiqPay POSTs the buyer back; a page route answers GET only, so bounce it. */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const paymentId = searchParams.get('paymentId') ?? ''
  return NextResponse.redirect(new URL(`/checkout/result?paymentId=${paymentId}`, request.url), 303)
}
```

and change `resultUrl` at `app/api/checkout/route.ts:123` to `${WEBSITE_URL}/api/checkout/result?paymentId=${paymentId}`. Then re-run Steps 1–2 and commit that as `fix: accept LiqPay's POST back to result_url` before continuing.

- [ ] **Step 3: Confirm the webhook ran clean**

Check the terminal running `npm run dev`.

Expected: **no `[liqpay-callback]` lines at all.** Every log line in that handler is an error path — silence is success.

- `payload signature mismatch` → LiqPay mangled the query string (the HMAC tag itself is verified working, so suspect URL encoding).
- `payload/order_id mismatch` → the payload was bound to a different payment.
- `paid order not created — stock changed` → the mock work's `instock` went to 0 between the two checks; each mock has quantity 1, so this is expected on a *second* purchase of the same product and means you must pick a different `[DEV]` item.
- `processing failed` → read the attached error; most likely the CRM rejecting the order payload, which Step 4 confirms.

- [ ] **Step 4: Confirm the order landed in the CRM**

Run:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders"
```

Expected: exactly one order in `response[]`. Check every one of these: `order_id` matches the `paymentId` from the result URL; `first_name`/`last_name`/`phone`/`email` match what was typed; `address_1.city` and `address_1.address_1` match; `price` is `260`; `currency` is UAH; `status` is `"pending"`; `info.is_paid` is `true` with `payment_type: "LiqPay"`; and `order_data[0]` names `[DEV] Свічка фігурна «Спіраль»` with `sku: "DEV-KRSEAK"`, `quantity: 1`, and `price`/`total` of 260.

If the order is missing or `order_data` is empty or wrong, the shape at `lib/hugeprofit/orders.ts:93-106` is wrong. The most likely culprit is the `product_id: null` + `local_product_id` pairing — try sending the numeric product id as `product_id` instead. Fix, re-run Steps 1–4 with a *different* `[DEV]` product (the first one's stock is now spent), and commit the fix separately.

- [ ] **Step 5: Confirm the reservation hit the dev warehouse and only the dev warehouse**

The `POST /bapi/remote_orders` response carries `reservedProducts: [[product_id, marketplace_id]]`, and the CRM — not our code — chooses which warehouse to reserve from. This step proves that choice landed on 51630.

Run:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?product_id=9054727&warehouse_id=51630"
```

Expected: the product's `stock[0]` shows `mid: 51630`, `instock: 0` (down from 1), and `quantity: 1` — `instock` is availability and `quantity` is physical stock on hand; they diverge on reservation, as verified live on 2026-08-13 and documented at `lib/hugeprofit/map.ts:105-109`.

Then run the real-shop count as a safety assertion. **Do not use `count=1` for this** — it ignores `warehouse_id` and returns the account-wide total (308 on 2026-09-07: 258 real + 50 mock), so it cannot tell the two warehouses apart. Count the rows instead:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?limit=500&warehouse_id=34998" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.length))"
```

Expected: `258` — the real shop is untouched by this test purchase. If it moved, stop immediately and raise it: that would mean the CRM reserves across warehouses, which invalidates the whole isolation premise of this plan.

If `instock` did **not** move on the dev product, note it: it means a paid work stays purchasable and the owners need to know reservation is manual.

- [ ] **Step 6: Commit any fixes this task produced**

If Steps 1–5 needed no source change, skip this step and commit nothing.

```bash
git add -A
git status
git commit -m "fix: <what the live CRM/LiqPay round trip actually required>"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Task 5: Sandbox failure paths

The happy path is the cheap half. These three cases decide whether a failure costs the owners money or just an apology.

**Files:**
- No planned source changes.

- [ ] **Step 1: Abandon a payment**

Start a checkout for a *different* `[DEV]` product than Task 4 used — `[DEV] Набір чайних свічок, 12 шт.` (`9054728`, ₴340) — reach LiqPay's page, then close the tab without paying. Return to the site.

Expected: **no new CRM order** (`GET /bapi/remote_orders` still returns exactly the one order from Task 4), the cart still holds the work, and the product's `instock` is still 1.

- [ ] **Step 2: Confirm a failed status renders as failure, not success**

Visit `https://<tunnel>/checkout/result?paymentId=1` — an id LiqPay has never seen.

Expected: the "Оплата не пройшла" failure view or the "Перевіряємо оплату…" pending view — **never** the success view, and the cart is **not** cleared. `checkStatus` returns `unknown` for an unknown id, which `ResultView` renders as pending.

- [ ] **Step 3: Confirm a duplicate webhook does not double-order**

LiqPay may redeliver a webhook. The spec claims idempotency comes from the CRM rejecting a duplicate `order_id` ("Idempotency without a database"), and that claim has never been tested. Test it directly rather than waiting for a redelivery — substitute the real `order_id` from Task 4:

```bash
curl -s -X POST "https://crm.h-profit.com/bapi/remote_orders" \
  -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  -d '{"data":{"order_id":<the order_id from Task 4>,"order_name":"duplicate probe","price":260,"currency":"UAH","status":"pending","first_name":"Тест","address_1":{"address_1":"вул. Тестова 1","city":"Львів","delivery_cost":0},"info":{"is_paid":true,"payment_type":"LiqPay"},"order_data":[{"product_id":null,"local_product_id":9054727,"id":9054727,"name":"[DEV] Свічка фігурна «Спіраль»","sku":"DEV-KRSEAK","quantity":1,"price":260,"total":260,"is_paid":true,"payment_type":"LiqPay"}]}}'
```

Expected: an error response, and `GET /bapi/remote_orders` still shows exactly one order with that `order_id`.

If a **second** order appears, the CRM does not enforce a unique `order_id`, the spec's idempotency claim is false, and a LiqPay redelivery would double-book the owners. Stop and raise it — that is a design-level problem this plan cannot paper over, and it must be resolved before the production cutover.

- [ ] **Step 4: Record what the failure paths actually did**

In `.claude/docs/domain/checkout.md`, find the section describing the LiqPay flow and add a short verification paragraph: the date (2026-09-07), that a sandbox payment created a real CRM order end to end **against the mock `dev` warehouse (51630), not the live shop**, and the observed behaviour of abandonment, unknown-payment status, and duplicate `order_id`. Keep it to a paragraph — this doc records rules, not test logs.

- [ ] **Step 5: Commit**

```bash
git add .claude/docs/domain/checkout.md
git commit -m "docs: record the sandbox verification of the LiqPay flow"
```

---

## Task 6: Restore the real catalog and truth up the comments

**Files:**
- Modify: `.env.local` (restore — never committed)
- Modify: `lib/liqpay/client.ts:5-8` (comment)
- Modify: `lib/hugeprofit/orders.ts:5-9` (comment)

- [ ] **Step 1: Restore local env and stop the tunnel**

In `.env.local`: restore `WEBSITE_URL` to the value recorded in Task 3 Step 3, and **comment out `CRM_WAREHOUSE_ID`**. Stop the cloudflared tunnel. Restart `npm run dev`.

Expected on `http://localhost:3000/shop`: the real catalog, not three `[DEV]` items. If mock rows are still showing, `CRM_WAREHOUSE_ID` is still set or the dev server was not restarted.

- [ ] **Step 2: Confirm no tunnel URL leaked into the repo**

Run: `grep -rn "trycloudflare\|ngrok" --include="*.ts" --include="*.tsx" --include="*.md" . --exclude-dir=node_modules --exclude-dir=.git`

Expected: matches only inside plan documents under `docs/superpowers/plans/`. Anything in source is a leaked tunnel URL — remove it.

- [ ] **Step 3: Correct the two "never exercised" comments**

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
 * against a sandbox account 2026-09-07. `amount` is in major units (₴).
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
 * LiqPay sandbox payment on 2026-09-07 against the mock `dev` warehouse — the
 * field shapes below are confirmed, not docs-derived guesses.
 */
```

- [ ] **Step 4: Typecheck and commit**

Run: `npm run build`

Expected: succeeds (comment-only changes, and the catalog now reads the real warehouse again).

```bash
git add lib/liqpay/client.ts lib/hugeprofit/orders.ts
git status
git commit -m "docs: comments now reflect the sandbox-verified payment path"
```

- [ ] **Step 5: Hand off to the production cutover**

State plainly which of Tasks 3–5 passed and which needed fixes, then point at `docs/superpowers/plans/2026-09-06-liqpay-go-live.md` **Task 5** as the next step. Do not begin it: it needs live LiqPay keys, Vercel project access, a real card, and a merge to `master` — all decisions for the owners, not this plan.

**Carry these two warnings into that handoff:**

1. `CRM_WAREHOUSE_ID` must **not** be added to the Vercel environment. Its absence is what keeps production on warehouse 34998.
2. The go-live plan's Task 5 Step 6 buys a real work with a real card. Everything this plan verified was against mock stock, so that step remains the first real-money test.

---

## Self-Review Notes

- **Spec coverage:** the spec's carried-forward open item (sandbox verification of the signature algorithm and `amount` units) is Task 3 Step 5. Its idempotency claim, previously untested, is now directly probed in Task 5 Step 3. Non-goals are respected and restated under "What this plan deliberately does not do".
- **Type consistency:** Task 1 changes `SHOP_WAREHOUSE_ID` from a literal to a computed value of the same name and type; no signature anywhere changes, and Step 1 confirms the single definition and single importer before the edit. No later task references a symbol Task 1 did not produce.
- **No placeholders:** every step carries real code, a real command with its expected output, or an exact document edit. The intentional blanks are `<random-words>.trycloudflare.com` (unknowable before Task 3 Step 2) and `<the order_id from Task 4>` (generated at payment time).
- **Ordering rationale:** Task 1 is the only source change and is verifiable without any LiqPay credential, so it can land and be reviewed while the sandbox keys are still being obtained. Task 2 unblocks a browser cart. Tasks 3→4→5 escalate the cost of failure (payment page → real CRM write → failure paths). Task 6 restores the environment so nobody inherits a machine pointed at mock data.
- **Known human-only steps:** Task 2 (CRM UI image upload), Task 3 Steps 1–2 and 5 (LiqPay dashboard, tunnel, browser), Task 4 Steps 1–2, Task 5 Steps 1–2. A subagent can execute Task 1 and Task 6 unattended; the rest need a person with a browser.

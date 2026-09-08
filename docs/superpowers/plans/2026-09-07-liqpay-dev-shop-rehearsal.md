# LiqPay Dev-Shop Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the whole LiqPay payment chain end to end — payment page, webhook, real CRM order creation, failure paths — against the CRM's `dev` warehouse and its 50 mock products, so that not one real artwork is reserved, sold, or refunded during verification, enforced in code rather than by discipline.

**Architecture:** No new subsystems and no change to the payment flow itself. Two changes in `lib/hugeprofit/`: `SHOP_WAREHOUSE_ID` becomes environment-driven so `CRM_WAREHOUSE_ID=51630` swings the entire site — catalog, product pages, checkout validation, webhook stock re-check — onto the mock catalog; and `createRemoteOrder`, the single chokepoint where a CRM order comes into existence, refuses to run against the real shop while `LIQPAY_SANDBOX=1`. Everything else in this plan is running the flow and reading what comes back.

**Tech Stack:** Next.js 16 App Router route handlers, Node's built-in `crypto` (no new dependency). **There is no test framework in this repo and none is being added** (deliberate — see spec Non-goals; Node here is v20.19.0, which cannot run TypeScript directly, so `node --test` is not an option). Verification is `npm run build` (the de-facto typecheck), runnable `curl` and `node` checks against `npm run dev`, and real sandbox payments.

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
- **No test order may be created against warehouse 34998.** Task 1 enforces this in code; no later task may weaken or bypass that guard to make a step pass.

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
2. No LiqPay sandbox credentials — **still open.** Task 4 Step 1 is where they get obtained; Tasks 4–6 cannot start without them. Tasks 1–3 do not need them.

## Why the warehouse constant is the whole trick

`lib/hugeprofit/index.ts` sends `warehouse_id: SHOP_WAREHOUSE_ID` on every product query and passes the same constant to `toProduct` to pick the stock row. Both halves currently say `34998`, and the CRM's filter is strict — verified 2026-09-07:

```
GET /bapi/products?product_id=9054668&warehouse_id=34998  →  {"data": []}
```

So a dev product is invisible to `getFreshProduct` today, and `POST /api/checkout` for one returns `409 unavailable`. Making that constant configurable is the only behavioural source change this plan needs; the webhook, the catalog and the product pages all follow it for free because they share it.

## How "only DEV" is enforced

Weakest to strongest:

1. **Convention** — `.env.local` sets `CRM_WAREHOUSE_ID=51630` for the duration of this plan. A human can forget this.
2. **Isolation** — the CRM's own `warehouse_id` filter means a dev product is invisible to the real shop's queries and vice versa (verified above). This stops mock data leaking into the shop, but it does *not* stop a sandbox payment for a **real** work if the override is missing.
3. **The order guard (Task 1)** — `createRemoteOrder` throws if `LIQPAY_SANDBOX=1` while `SHOP_WAREHOUSE_ID` is the real shop. Order creation is the only operation in this codebase that reserves stock, and it has exactly one chokepoint. Task 2 proved this fires, by minting a genuinely valid webhook callback locally.
4. **The write catch-all** — `crmPost` refuses *any* CRM write under the same condition, so a future write path inherits the protection instead of having to remember it. Deliberately redundant with layer 3 today; layer 3 stays because its message names the order and Task 2's evidence quotes it.
5. **The read gate** — when `SHOP_WAREHOUSE_ID` is not the real shop (`DEV_ONLY`), `crmFetch` refuses any request that names a different warehouse, and any request that names none at all — an unscoped `products` read returns the real catalogue alongside the mock rows. Not reachable through today's callers, which all pass `SHOP_WAREHOUSE_ID`; it exists to stop a future one widening silently.
6. **The production gate** — `lib/hugeprofit/client.ts` throws at import if `VERCEL_ENV === 'production'` and `CRM_WAREHOUSE_ID` is set, so a deployed site can never serve mock works as the real shop. `VERCEL_ENV`, not `NODE_ENV`, because `npm run build` sets the latter and local production builds must keep working. Verified 2026-09-07: the build fails with that message.
7. **Token scope (the only real boundary, and it is not in this repo)** — every gate above is our own code asking itself nicely; `HUGEPROFIT_API_KEY` still grants the whole account, and any script bypassing the app (the seeding scripts did exactly that) reaches the real shop. The CRM's integration settings offer "select the appropriate warehouses to which the API will have access" and a separate reservation-warehouse choice. A token scoped to `dev` is the only thing that makes real-shop access *impossible* rather than *guarded*. Run `node scripts/crm-scope.mjs` to see what the current token actually reaches.

## What this plan deliberately does not do

- **No production cutover.** That is Task 5 of `2026-09-06-liqpay-go-live.md`, unchanged, and runs after this plan passes.
- **No refund flow.** Spec Non-goals. A paid-but-sold-out order still logs loudly and waits for a human (`app/api/checkout/liqpay-callback/route.ts:57-65`).
- **No block on the reverse misconfiguration** (live keys pointed at the dev warehouse — real money for a mock candle). It costs the tester their own money, not the owners' stock, and the "never set `CRM_WAREHOUSE_ID` in Vercel" constraint covers production. Add a guard for it only if it actually happens.
- **No deletion of the `[DEV]` rows.** No API exists for it; leave them, they are inert outside warehouse 51630.
- **No test framework.** Node 20 cannot run TS directly and the repo has no runner; adding one is a separate decision.
- **No image upload for products that already exist.** `POST /bapi/products` ingests `images[]` on **create** (asynchronously — see Task 3), but the API has no update-by-id and no upload endpoint, so an existing product's images can only be changed in the CRM UI. Task 3 sidesteps this by creating new imaged mocks rather than back-filling old ones.

---

## Task 1: Warehouse override plus the sandbox guard

**Files:**
- Modify: `lib/hugeprofit/client.ts:13-17`
- Modify: `lib/hugeprofit/orders.ts:1-9` and `:111-120`
- Modify: `.env.example`
- Modify: `CLAUDE.md` (env var list)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SHOP_WAREHOUSE_ID: number` (same name, same type, same import site at `lib/hugeprofit/index.ts:4`), a new export `REAL_SHOP_WAREHOUSE_ID: number` from `lib/hugeprofit/client.ts`, and an unchanged `createRemoteOrder(orderId: number, lines: OrderLine[], contact: OrderContact, payment: PaymentInfo): Promise<CreatedOrder>` that now throws `CrmError` in one new case. No call signature changes anywhere.

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
/** "Крамничка ПІЧ" — the only warehouse real works are sold from. */
export const REAL_SHOP_WAREHOUSE_ID = 34998

/**
 * The account also has "Події в ПІЧі" (35002) and the mock "dev" warehouse
 * (51630); `CRM_WAREHOUSE_ID` swings the whole site onto one of those for
 * payment testing. Never set it in production.
 */
const configuredWarehouse = Number(process.env.CRM_WAREHOUSE_ID)
export const SHOP_WAREHOUSE_ID =
  Number.isInteger(configuredWarehouse) && configuredWarehouse > 0
    ? configuredWarehouse
    : REAL_SHOP_WAREHOUSE_ID
```

The guard matters: `Number(undefined)` is `NaN` and `Number('')` is `0`, and either one reaching the CRM as `warehouse_id` returns an empty catalog — an entirely blank shop rather than a visible error.

- [ ] **Step 3: Refuse to create a real-shop order in sandbox mode**

In `lib/hugeprofit/orders.ts`, replace line 3:

```ts
import { crmPost } from './client'
```

with:

```ts
import { crmPost, CrmError, REAL_SHOP_WAREHOUSE_ID, SHOP_WAREHOUSE_ID } from './client'
```

Then, in `createRemoteOrder`, insert the guard as the first statement of the function body — above the existing `const payload = buildOrderPayload(...)` line:

```ts
  // Money safety: sandbox payments must never reserve a real work. This is the
  // only place an order comes into existence, so it is the only place to check.
  if (process.env.LIQPAY_SANDBOX === '1' && SHOP_WAREHOUSE_ID === REAL_SHOP_WAREHOUSE_ID) {
    throw new CrmError(
      `refusing to create order ${orderId} in the real shop while LIQPAY_SANDBOX=1 — set CRM_WAREHOUSE_ID to a test warehouse`,
    )
  }
```

`CrmError` is a class declared later in `client.ts` but imported here, so there is no temporal-dead-zone problem: it is only referenced when the function runs.

- [ ] **Step 4: Document the variable in `.env.example`**

In `.env.example`, add this line directly below the `HUGEPROFIT_API_KEY` line:

```bash
# CRM_WAREHOUSE_ID=51630           # optional — swings the catalog onto the mock "dev" warehouse. NEVER set in production.
```

Leave it commented out. An empty `CRM_WAREHOUSE_ID=` would be `Number('') === 0`, which the Step 2 guard rejects, but a commented line states the intent better.

- [ ] **Step 5: Document the variable in `CLAUDE.md`**

In `CLAUDE.md`, in the fenced env block under "Development Commands", add this line directly below `HUGEPROFIT_API_KEY=...`:

```bash
CRM_WAREHOUSE_ID=51630            # optional, local only — points the catalog at the mock "dev" warehouse
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`

Expected: succeeds, including the static page-data collection phase (this is the phase that failed with `CrmError: CRM products responded 403` before the API key was fixed; it must pass now). If it fails with a 403, the CRM key has been rejected again — stop and resolve that before any later task, because Tasks 2–6 all need working CRM reads and writes.

- [ ] **Step 7: Prove the override actually reaches the CRM**

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

- [ ] **Step 8: Prove the default is unchanged**

Comment out `CRM_WAREHOUSE_ID` in `.env.local`, restart `npm run dev`, and re-run the exact curl from Step 7.

Expected: `409` with `{"error":"unavailable","unavailable":["9054727"]}` — the dev product is correctly invisible when the override is absent. This is the check that proves production behaviour did not move.

Leave `CRM_WAREHOUSE_ID` commented out for now; Task 2 Step 4 needs it that way, and Task 2 Step 6 turns it back on.

- [ ] **Step 9: Commit**

```bash
git add lib/hugeprofit/client.ts lib/hugeprofit/orders.ts .env.example CLAUDE.md
git status
git commit -m "feat: warehouse override for payment testing, with a real-shop guard"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Task 2: Prove the webhook accept path and the guard, locally

Everything verified so far about the webhook is a rejection: forged payloads get 400s. **Nothing has ever proved the accept path works**, and the previous plan's review flagged exactly that, deferring it to a sandbox payment.

It does not have to wait. `verifyCallback` (`lib/liqpay/client.ts:61-63`) checks `sign(data) === signature`, and `sign` uses `LIQPAY_PRIVATE_KEY` from `.env.local` — a key this machine holds. So a valid callback can be minted locally against the dev server: same construction LiqPay uses, no LiqPay account, no tunnel, no money. That proves the CRM write path and the Task 1 guard in one sitting, and it is the last verification possible before sandbox credentials exist.

**Files:**
- Create: `<scratchpad>/mint-callback.mjs` — a throwaway outside the repo. Do not commit it. (`<scratchpad>` is this session's scratchpad directory.)
- No source changes unless a check fails.

**Interfaces:**
- Consumes: `encodePayload`'s wire format from Task 1's untouched `lib/liqpay/payload.ts` — `<base64url(JSON)>.<base64url(HMAC-SHA256(LIQPAY_PRIVATE_KEY, body))>` — and `sign` from `lib/liqpay/client.ts:28-31` — `base64(sha1(key + data + key))`. The script reimplements both in plain JS because the repo has no TS runner; if either ever changes, this script must change with it.
- Produces: nothing importable. A pass/fail verification only.

- [ ] **Step 1: Write the minting script**

Create `<scratchpad>/mint-callback.mjs`:

```js
// Throwaway: mints a webhook callback that is valid by our own code's rules.
// Not a test framework, not repo code — do not commit.
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync('C:/code/pich/.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).split('#')[0].trim()]),
)
const key = env.LIQPAY_PRIVATE_KEY
if (!key) throw new Error('LIQPAY_PRIVATE_KEY missing from .env.local')

const [productId, price] = [process.argv[2], Number(process.argv[3])]
if (!productId || !Number.isFinite(price)) {
  throw new Error('usage: node mint-callback.mjs <productId> <price>')
}

const paymentId = Date.now()
const payloadJson = JSON.stringify({
  paymentId,
  lines: [{ productId, price, qty: 1 }],
  contact: {
    name: 'Тест Тестенко',
    email: 'test@example.com',
    phone: '+380990000000',
    city: 'Львів',
    address: 'вул. Тестова 1',
  },
})
const body = Buffer.from(payloadJson).toString('base64url')
const payload = `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`

// LiqPay's own construction: base64 JSON, signed sha1(key + data + key).
const data = Buffer.from(
  JSON.stringify({ status: 'sandbox', order_id: String(paymentId), amount: price, currency: 'UAH' }),
).toString('base64')
const signature = createHash('sha1').update(key + data + key).digest('base64')

const res = await fetch(
  `http://localhost:3000/api/checkout/liqpay-callback?payload=${payload}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data, signature }),
  },
)
console.log(`paymentId=${paymentId} http=${res.status}`)
```

- [ ] **Step 2: Confirm the dev server is running with the real-shop default**

`CRM_WAREHOUSE_ID` must still be commented out in `.env.local` from Task 1 Step 8, and `LIQPAY_SANDBOX=1` must be set. Restart `npm run dev` and watch its terminal for the rest of this task.

- [ ] **Step 3: Fire a callback for a REAL work and confirm the guard blocks it**

Pick any real work's product id from the live shop:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?limit=1&warehouse_id=34998" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).data[0];console.log(p.id,p.stock[0].sale_price>0?p.stock[0].sale_price:p.stock[0].price)})"
```

Then run the script with that id and price:

```bash
node <scratchpad>/mint-callback.mjs <real product id> <its price>
```

Expected: `http=200` (the webhook always answers 200 to LiqPay), **and the dev server log shows `[liqpay-callback] processing failed` with a `CrmError` reading `refusing to create order … while LIQPAY_SANDBOX=1`.**

Then confirm nothing was created:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders" | head -c 200
```

Expected: `{"success": true, "response": []}` — still no orders in the account.

**If an order WAS created for a real work, stop the entire plan.** The guard does not work, a real artwork has been reserved with fake money, and it must be cancelled in the CRM UI before anything else proceeds.

- [ ] **Step 4: Confirm the guard also blocks a `payload signature mismatch`-free happy path — i.e. that Step 3 failed at the guard, not earlier**

Read the dev server log from Step 3 again.

Expected: **no** `payload signature mismatch` line and **no** `signature mismatch` line. If either appears, the script's signing does not match the app's and Step 3 proved nothing about the guard — fix the script against `lib/liqpay/payload.ts` and `lib/liqpay/client.ts:28-31`, then re-run Step 3.

The distinction matters: a rejected signature and a working guard produce the same "no order created" outcome, and only one of them is the thing being tested.

- [ ] **Step 5: Confirm a paid-but-sold-out real work is also refused**

No action needed if Step 3 passed — the guard fires before any stock check, so this case cannot reach order creation either. Note it and move on.

- [ ] **Step 6: Switch to the dev warehouse and fire the same callback for a mock work**

Set `CRM_WAREHOUSE_ID=51630` in `.env.local` and restart `npm run dev`. Then:

```bash
node <scratchpad>/mint-callback.mjs 9054727 260
```

Expected: `http=200` and **no `[liqpay-callback]` lines in the dev server log at all** — every line in that handler is an error path, so silence is success.

- [ ] **Step 7: Confirm the order landed in the CRM, against the dev warehouse**

Run:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders"
```

Expected: exactly one order. Check all of: `order_id` equals the `paymentId` the script printed; `price` is `260`; `currency` UAH; `status` `"pending"`; `info.is_paid` `true` with `payment_type: "LiqPay"`; `first_name` `Тест`, `last_name` `Тестенко`, `phone`/`email` as in the script; `address_1.city` `Львів`; and `order_data[0]` naming `[DEV] Свічка фігурна «Спіраль»` with `sku: "DEV-KRSEAK"`, `quantity: 1`, `price` and `total` of 260.

This is the first time `POST /bapi/remote_orders` has ever run — `GET /bapi/remote_orders` returned `{"success": true, "response": []}` on 2026-09-07 — so the field shapes at `lib/hugeprofit/orders.ts:93-106` are being proved here, not assumed.

If the order is missing or `order_data` is empty or wrong, the most likely culprit is the `product_id: null` + `local_product_id` pairing — try sending the numeric product id as `product_id` instead. Fix, re-run Step 6 against a *different* `[DEV]` product (this one's stock is now spent), and commit the fix separately.

- [ ] **Step 8: Confirm the reservation hit the dev warehouse and the real shop is untouched**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?product_id=9054727&warehouse_id=51630"
```

Expected: `stock[0]` shows `mid: 51630`, `instock: 0` (down from 1), `quantity: 1` — `instock` is availability, `quantity` is physical stock on hand, and they diverge on reservation (verified live 2026-08-13, documented at `lib/hugeprofit/map.ts:105-109`).

Then the real-shop assertion. **Do not use `count=1`** — it ignores `warehouse_id` and returns the account-wide total (308 on 2026-09-07: 258 real + 50 mock), so it cannot tell the warehouses apart. Count rows instead:

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?limit=500&warehouse_id=34998" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.length))"
```

Expected: `258`. If it moved, stop and raise it — that would mean the CRM reserves across warehouses, which invalidates the isolation premise of this whole plan.

- [ ] **Step 9: Test the duplicate-order claim while a real order exists to duplicate**

The spec claims idempotency comes from the CRM rejecting a duplicate `order_id` ("Idempotency without a database"), and that has never been tested. Re-run the exact same callback — the script generates a fresh `paymentId` each run, so instead re-send the duplicate directly, substituting the `order_id` from Step 7:

```bash
curl -s -X POST "https://crm.h-profit.com/bapi/remote_orders" \
  -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  -d '{"data":{"order_id":<the order_id from Step 7>,"order_name":"duplicate probe","price":260,"currency":"UAH","status":"pending","first_name":"Тест","address_1":{"address_1":"вул. Тестова 1","city":"Львів","delivery_cost":0},"info":{"is_paid":true,"payment_type":"LiqPay"},"order_data":[{"product_id":null,"local_product_id":9054727,"id":9054727,"name":"[DEV] Свічка фігурна «Спіраль»","sku":"DEV-KRSEAK","quantity":1,"price":260,"total":260,"is_paid":true,"payment_type":"LiqPay"}]}}'
```

Expected: an error response, and `GET /bapi/remote_orders` still showing exactly one order with that `order_id`.

If a **second** order appears, the CRM does not enforce a unique `order_id`, the spec's idempotency claim is false, and a LiqPay redelivery would double-book the owners. Record it and raise it — it must be resolved before the production cutover, though it does not block the remaining tasks here.

- [ ] **Step 10: Record what was proved**

In `.claude/docs/domain/checkout.md`, find the section describing the LiqPay flow and add a short paragraph: on 2026-09-07 the webhook's accept path was exercised with a locally-minted valid callback, creating the account's first `remote_orders` record against the mock `dev` warehouse (51630); `createRemoteOrder` refuses to run against warehouse 34998 while `LIQPAY_SANDBOX=1`; and whatever Step 9 showed about duplicate `order_id`. Keep it to a paragraph — this doc records rules, not test logs.

- [ ] **Step 11: Commit**

```bash
git add .claude/docs/domain/checkout.md
git status
git commit -m "docs: record the locally-verified webhook accept path and the sandbox guard"
```

The minting script stays in the scratchpad and is **not** committed. Confirm it does not appear in `git status`.

---

## Task 3: Get a mock work into the cart

`isSellable` (`lib/hugeprofit/index.ts:26-28`) drops any product with an empty `images[]`, by design: "a work with no photograph has nothing to sell". The first 50 seeded mocks had none, so the grid rendered nothing.

**Already done, 2026-09-07.** `POST /bapi/products` *does* accept `images[]` — it fetches each URL and re-hosts it, but **asynchronously**, so a readback immediately after creation still shows `[]` and looks like a silent drop. Waiting and re-reading shows the ingested CRM-hosted URL. Five dev products now carry images and render at `/shop`:

| product_id | sku | name | price |
|---|---|---|---|
| 9060539 | `DEV-Z8AJ17` | `[DEV] Свічка «Тиха ніч»` | 340 |
| 9060540 | `DEV-3TMCHI` | `[DEV] Листівки «Дахи», набір 6 шт.` | 380 |
| 9060541 | `DEV-ZGXDCD` | `[DEV] Чашка «Ранкова глина»` | 420 |
| 9060532 | `DEV-GQONAN` | `[DEV] Проба зображення` | 100 |
| 9054668 | `DEV-GGPG7T` | `[DEV] Ваза «Ранок»` | 1450 |

**Files:**
- No source changes.

- [ ] **Step 1: Start the dev server against the dev warehouse**

`CRM_WAREHOUSE_ID=51630` must be active (not commented out) in `.env.local`, alongside `LIQPAY_SANDBOX=1`. Run `npm run dev`.

- [ ] **Step 2: Confirm the mock shop renders**

Open `http://localhost:3000/shop`.

Expected: the five works above, each under its `[DEV]` name and attributed to artist `DEV`. Clicking one opens its product page; "Додати в кошик" fills the cart.

If the grid is empty or stale, the catalog cache is holding an older list — `rm -rf .next/cache/fetch-cache` and restart `npm run dev`. The 5-minute `CATALOG_REVALIDATE` window otherwise applies.

- [ ] **Step 3: Nothing to commit**

This task changes no files. Do not commit.

**Fallback, if you ever need a work that has no image:** the cart is client-side localStorage holding whole `Product` objects (`components/providers.tsx:68`, key `plai-pich-cart-v2`), and `POST /api/checkout` validates through `getFreshProduct`, which does **not** filter on images — so a cart seeded from the console reaches LiqPay exactly as a clicked one does (verified 2026-09-07, returning `amount: 340`). Seed it with `localStorage.setItem('plai-pich-cart-v2', JSON.stringify([{ product: <the Product shape>, qty: 1 }])); location.reload()`.

---

## Task 4: Sandbox credentials, tunnel, and payment page

This task's deliverable is narrow and worth its own gate: **LiqPay accepts our signed request and renders a payment page for a mock work.** That single outcome validates both of the spec's flagged assumptions — the signature algorithm, and that `amount` is in major currency units (₴, not kopiyky). If `amount` were wrong by 100×, the payment page shows it.

**Files:**
- Modify: `.env.local` (gitignored — never committed)
- No source changes unless a check fails.

- [ ] **Step 1: Get LiqPay sandbox keys**

In the LiqPay merchant dashboard, switch the account to sandbox mode and copy the sandbox `public_key` / `private_key` pair (they are prefixed `sandbox_`).

- [ ] **Step 2: Start a public tunnel to the dev server**

LiqPay's servers must reach `server_url`, and `localhost` is not reachable from them.

Run: `npx cloudflared tunnel --url http://localhost:3000`

Expected: prints a `https://<random-words>.trycloudflare.com` URL. (`npx ngrok http 3000` works too but now requires an account and authtoken; cloudflared needs neither.) Leave this running for Tasks 4–6.

- [ ] **Step 3: Point `.env.local` at the tunnel**

Set these in `.env.local`, keeping `HUGEPROFIT_API_KEY` as it already is:

```bash
WEBSITE_URL=https://<random-words>.trycloudflare.com
CRM_WAREHOUSE_ID=51630
LIQPAY_PUBLIC_KEY=sandbox_...
LIQPAY_PRIVATE_KEY=sandbox_...
LIQPAY_SANDBOX=1
```

`lib/site.ts` reads `WEBSITE_URL` at module load, so **restart `npm run dev`** after editing. Write down the previous `WEBSITE_URL` value — Task 7 restores it.

Note that swapping `LIQPAY_PRIVATE_KEY` for the real sandbox key invalidates Task 2's minting script for any payload minted with the old key. That is expected; the script is only ever run fresh.

- [ ] **Step 4: Confirm the tunnel reaches the app**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<random-words>.trycloudflare.com/shop`

Expected: `200`. Anything else means LiqPay's webhook will never arrive either — fix the tunnel before paying for anything.

- [ ] **Step 5: Reach LiqPay's payment page**

Open the tunnel URL in a browser, add `[DEV] Свічка «Тиха ніч»` (`9060539`, ₴340) to the cart, go to `/checkout`, fill the form with any plausible contact details, and submit.

Expected: the browser navigates to a `liqpay.ua`-hosted payment page. **Read the amount printed on that page and confirm it says `340,00 ₴`** — not `3,40 ₴` and not `34 000 ₴`.

If LiqPay shows a signature error instead of a payment form, `sign()` (`lib/liqpay/client.ts:28-31`) disagrees with LiqPay's current algorithm — recheck it against LiqPay's docs before continuing; every later task depends on it.

If the amount is off by 100×, `amount` is not in major units: divide by 100 at `app/api/checkout/route.ts:121` where `amount: total` is passed, re-run this step, and commit that fix separately as `fix: send LiqPay the amount in kopiyky`.

- [ ] **Step 6: Record the outcome in the spec's open items**

In `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`, replace the `## Open items carried forward` section with:

```markdown
## Open items carried forward

- ~~Sandbox verification of the two flagged assumptions above must happen before the rest of the design is trusted.~~ **Done 2026-09-07:** signature algorithm and `amount`-in-major-units both confirmed against a LiqPay sandbox account, buying a mock work from the CRM's `dev` warehouse.
```

Then correct this spec's idempotency claim, which Task 2 disproved. Find the "Idempotency without a database" passage and replace its assertion that the CRM rejects a duplicate `order_id` with:

```markdown
Re-POSTing an existing `order_id` does **not** error and does **not** create a second order — the CRM upserts, overwriting the existing row in place and blanking any field the new payload omits (verified 2026-09-07). Idempotency therefore rests on `order_id` being `Date.now()`, unique per checkout, plus the fact that a LiqPay redelivery replays the same payload and so rewrites identical values. The CRM is not a guard here.
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-liqpay-payment-design.md
git commit -m "docs: mark LiqPay's flagged assumptions sandbox-verified"
```

---

## Task 5: Full sandbox happy path through the browser

Task 2 already proved the webhook creates a correct CRM order when handed a valid callback. What remains unproved is everything **LiqPay** does: that its real callback carries the fields we expect, that its query-string round trip preserves the payload tag, and that the buyer's return journey renders.

**Files:**
- No planned source changes. Fix whatever this task breaks, in the file it breaks in.

- [ ] **Step 1: Pay with LiqPay's sandbox test card**

With the tunnel and dev server still running, repeat the checkout from Task 4 Step 5 and complete payment with LiqPay's sandbox test card: `4242 4242 4242 4242`, any future expiry, any CVV.

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

Expected: **no `[liqpay-callback]` lines at all.**

- `payload signature mismatch` → LiqPay's query-string round trip mangled the tag. Task 2 proved the tag construction itself is sound, so suspect URL encoding of the `.` separator or base64url characters.
- `payload/order_id mismatch` → LiqPay's `order_id` is not coming back as the integer we sent.
- `paid order not created — stock changed` → the mock work's `instock` hit 0; each mock has quantity 1, so pick another `[DEV]` item.
- `processing failed` → read the attached error. If it names the sandbox guard, `CRM_WAREHOUSE_ID` was lost from `.env.local`.

- [ ] **Step 4: Confirm this second order landed in the CRM**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders"
```

Expected: **two** orders now — Task 2's locally-minted one and this one. The new one's `order_id` matches the `paymentId` in the result URL, its `price` is `340`, and its `order_data[0]` names `[DEV] Свічка «Тиха ніч»` with `sku: "DEV-Z8AJ17"`.

Compare the two orders field by field. Any difference between the locally-minted order and LiqPay's is a fact about LiqPay's callback that this codebase was guessing at — note it in Task 7's handoff.

- [ ] **Step 5: Confirm the real shop is still untouched**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?limit=500&warehouse_id=34998" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.length))"
```

Expected: `258`.

- [ ] **Step 6: Commit any fixes this task produced**

If Steps 1–5 needed no source change, skip this step and commit nothing.

```bash
git add -A
git status
git commit -m "fix: <what the live LiqPay round trip actually required>"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Task 6: Sandbox failure paths

The happy path is the cheap half. These cases decide whether a failure costs the owners money or just an apology.

**Files:**
- No planned source changes.

- [ ] **Step 1: Abandon a payment**

Start a checkout for a *different* `[DEV]` product — `[DEV] Листівки «Дахи», набір 6 шт.` (`9060540`, ₴380) — reach LiqPay's page, then close the tab without paying. Return to the site.

Expected: **no new CRM order** (`GET /bapi/remote_orders` still returns exactly the two orders from Tasks 2 and 5), the cart still holds the work, and the product's `instock` is still 1.

- [ ] **Step 2: Confirm a failed status renders as failure, not success**

Visit `https://<tunnel>/checkout/result?paymentId=1` — an id LiqPay has never seen.

Expected: the "Оплата не пройшла" failure view or the "Перевіряємо оплату…" pending view — **never** the success view, and the cart is **not** cleared. `checkStatus` returns `unknown` for an unknown id, which `ResultView` renders as pending (`components/checkout/result-view.tsx:24-25`).

- [ ] **Step 3: Record what the failure paths did**

Append to the paragraph added in Task 2 Step 10 in `.claude/docs/domain/checkout.md`: the date, that a real LiqPay sandbox payment completed end to end against the mock `dev` warehouse, and the observed behaviour of abandonment and unknown-payment status. Keep it short.

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/domain/checkout.md
git commit -m "docs: record the sandbox failure-path verification"
```

---

## Task 7: Restore the real catalog and truth up the comments

**Files:**
- Modify: `.env.local` (restore — never committed)
- Modify: `lib/liqpay/client.ts:5-8` (comment)
- Modify: `lib/hugeprofit/orders.ts:5-9` (comment)

- [ ] **Step 1: Restore local env and stop the tunnel**

In `.env.local`: restore `WEBSITE_URL` to the value recorded in Task 4 Step 3, and **comment out `CRM_WAREHOUSE_ID`**. Stop the cloudflared tunnel. Restart `npm run dev`.

Expected on `http://localhost:3000/shop`: the real catalog, not `[DEV]` items. If mock rows are still showing, `CRM_WAREHOUSE_ID` is still set or the dev server was not restarted.

Leaving `LIQPAY_SANDBOX=1` set locally is fine and safe: with the real catalog restored, the Task 1 guard now refuses to create any order at all, which is the correct posture for a machine that is not testing payments.

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

State plainly which of Tasks 4–6 passed and which needed fixes, then point at `docs/superpowers/plans/2026-09-06-liqpay-go-live.md` **Task 5** as the next step. Do not begin it: it needs live LiqPay keys, Vercel project access, a real card, and a merge to `master` — all decisions for the owners, not this plan.

**Carry these five warnings into that handoff:**

1. **Stock reservation is unproven, and may not happen at all.** Task 2's dev-warehouse order returned `reservedProducts: []` and left `instock` at 1, contradicting the standing claim that the CRM reserves stock on order creation. The cause is almost certainly that reservation targets a *single* warehouse fixed in the token's integration settings, where the mock product has no row — the API docs describe exactly that setting ("select the warehouse to which the goods will be reserved upon receipt of a new order"), so the mechanism is documented; only this account's chosen value is unread. Read it from the HugeProfit integration settings page — that settles it without spending a real work. **The owners need to know that a paid work may stay purchasable until someone moves it by hand.** Settle it on the production cutover's first real payment, and check the account's integration settings.
2. **A duplicate `order_id` overwrites, it does not reject.** Task 2 proved the CRM upserts, blanking fields the second payload omits. `order_id` is `Date.now()` so collisions between buyers are implausible and a LiqPay redelivery replays identical values, but the spec's named idempotency mechanism does not exist.
3. `CRM_WAREHOUSE_ID` must **not** be added to the Vercel environment. Its absence is what keeps production on warehouse 34998.
4. `LIQPAY_SANDBOX` must **not** be set in Vercel either — with live keys and the real shop that combination now throws on every order, so a stray value takes checkout down rather than merely making it fake.
5. The go-live plan's Task 5 Step 6 buys a real work with a real card. Everything this plan verified was against mock stock, so that step remains the first real-money test.

---

## Self-Review Notes

- **Spec coverage:** the spec's carried-forward open item (sandbox verification of the signature algorithm and `amount` units) is Task 4 Step 5. Its previously untested idempotency claim is probed in Task 2 Step 9. Its "webhook is the only order creator" rule is now enforced, not just documented, by Task 1 Step 3. Non-goals are respected and restated under "What this plan deliberately does not do".
- **Type consistency:** Task 1 keeps `SHOP_WAREHOUSE_ID: number` and `createRemoteOrder`'s signature identical, adds one export (`REAL_SHOP_WAREHOUSE_ID`), and Step 1 confirms the single definition and single importer before editing. Task 2's script reimplements two wire formats rather than importing them (no TS runner exists) and says so explicitly in its Interfaces block.
- **No placeholders:** every step carries real code, a real command with its expected output, or an exact document edit. The intentional blanks are `<random-words>.trycloudflare.com` (unknowable before Task 4 Step 2), `<scratchpad>` (session-specific), `<real product id>` (read at Task 2 Step 3), and `<the order_id from Step 7>` (generated at run time).
- **Ordering rationale:** Tasks 1 and 2 need no LiqPay account and no browser, so the guard lands and is proved before any credential exists — and Task 2 deliberately fires at the **real** shop first, while the guard is the only thing standing in the way, because that is the assertion the whole plan rests on. Task 3 unblocks a browser cart. Tasks 4→5→6 escalate cost of failure. Task 7 restores the environment so nobody inherits a machine pointed at mock data.
- **Known human-only steps:** Task 3 (CRM UI image upload), Task 4 Steps 1–2 and 5 (LiqPay dashboard, tunnel, browser), Task 5 Steps 1–2, Task 6 Steps 1–2. Tasks 1, 2 and 7 are executable unattended.

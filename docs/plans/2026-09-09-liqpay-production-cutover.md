# LiqPay Production Cutover Implementation Plan

> Work through the tasks in order. Each task ends with a verify step and a commit. Tick `- [ ]` → `- [x]` as you go.

**Goal:** Take the sandbox-verified LiqPay checkout live — real keys, real catalogue, one real purchase — and leave the site taking money for real works.

**Architecture:** No source changes are planned. The payment flow is built and verified end to end; this plan moves credentials and configuration, redeploys `master` (the payment code is already merged, `6f05794`), and proves the deployed result with one real payment. Every code change it might need is contingent on a check failing.

**Tech Stack:** Next.js 16 on Vercel (Hobby plan), HUGEPROFIT CRM as the only backend, LiqPay hosted checkout. No test framework in this repo and none is being added; verification is `npm run build`, `curl`, and real transactions.

**Spec:** the LiqPay design record was removed 2026-10-25; its rules live in `.claude/docs/domain/checkout.md`.

**Status (2026-10-25):** the only open payments plan. The earlier LiqPay plans (integration, go-live, dev-shop rehearsal, merge-ready) were fully executed and removed. Their ledgers are in `.superpowers/sdd/`. Cart quantity (qty > 1) shipped 2026-10-25 (PR #3). Task 4's purchase can be done at qty 1 as written; multi-unit CRM reservation is still unverified (`.claude/docs/domain/checkout.md`).

## Global Constraints

- **No new npm dependencies. No database. No test framework.**
- Env vars are server-only — no `NEXT_PUBLIC_` prefix on any of them, ever.
- **`CRM_WAREHOUSE_ID` must read `34998` in Production.** It is required and never defaulted, but nothing in code knows which warehouse is real — `51630` there would serve the mock works as the shop without any error. `DEV_ORIGIN` must not exist in Production at all.
- **`LIQPAY_SANDBOX` must never exist in the Vercel environment.** With live keys against the real shop, `crmPost` refuses every write while it is `"1"` — checkout would take money and create no order.
- **The webhook is the only code path allowed to call `createRemoteOrder`.** Nothing else creates CRM orders.
- `net_price` is the CRM's cost price and must never leave `lib/hugeprofit/`.
- **Never commit a key, a tunnel URL, or `.env.local`.** Check `git status` before every commit.
- Comments: 2–3 lines max, constraints only.

## What is already true

Verified during the 2026-09-07/08 dev-shop rehearsal (plan since removed, ledger at `.superpowers/sdd/2026-09-07-liqpay-dev-shop-rehearsal/progress.md`):

| Question | Answer | How |
|---|---|---|
| Webhook accept path works? | Yes | Real LiqPay sandbox callback, zero error logs |
| `amount` units | Major units (₴) | Order landed at `price: 340.0` for a ₴340 work |
| `result_url` method | **GET** | LiqPay returned the buyer with `GET /checkout/result` 200; the feared 405 does not apply |
| `order_data` field shapes | Confirmed | Two real CRM orders carry them |
| Stock reservation | Works, into the warehouse the **integration settings** name | `is_reserved: true`, `reserved_pids`, `mid: "51630"`, `instock 1 → 0` |
| Duplicate `order_id` | **Upserts** — overwrites in place, blanks omitted fields | Direct probe against the CRM |

The payment code is on `master` (squash-merged `6f05794`). Production has not yet been switched to live keys: `CLAUDE.md` still describes checkout as unpaid.

## The two things that make this dangerous

1. **The reservation warehouse is a CRM setting, not something this code sends.** The rehearsal proved reservation follows whatever the token's integration settings name. During the rehearsal that was the `dev` warehouse. **If production's token still points reservations at `dev`, every paid painting will fail to reserve and stay purchasable** — two buyers could pay for the same one-of-a-kind work. Task 1 checks this before anything else.
2. **`WEBSITE_URL` builds `server_url`** (`app/api/checkout/route.ts:124`). If it is wrong or missing in production, LiqPay charges the buyer and the webhook lands nowhere — a paid order that never reaches the CRM, with no automated recovery.

## What this plan deliberately does not do

- **No refund flow.** Spec Non-goals. The one real payment in Task 4 is refunded by hand in the LiqPay dashboard.
- **No fix for the duplicate-`order_id` upsert.** `order_id` is `Date.now()`, unique per checkout, and a LiqPay redelivery replays the same payload, so it rewrites identical values. Recorded as a known risk in `.claude/docs/domain/checkout.md`; fixing it needs storage this project deliberately does not have.
- **No cleanup of the 54 `[DEV]` rows.** They live in warehouse 51630, which production never queries, and the API has no delete-product endpoint. Task 3 confirms they are invisible rather than removing them.
- **Nothing about the CRM `description` field.** 171 of 258 descriptions hold internal notes and the site publishes them verbatim — a real problem, pre-existing, owned by the owners' data cleanup, and untouched by payments.

---

## Task 1: Pre-flight — restore full CRM access and prove the reservation warehouse

Nothing else may start until this passes. The rehearsal left this machine's token scoped to the `dev` warehouse and the catalogue pointed at it; both must move back together, and the reservation setting must be read with human eyes because no API exposes it.

**Files:**
- Modify: `.env.local` (gitignored — never committed)
- No source changes.

- [ ] **Step 1: Read the reservation warehouse in the CRM**

Open `https://crm.h-profit.com` → integration settings for the API token production will use (the same page that scopes warehouse access). The docs describe the field as *"select the warehouse to which the goods will be reserved upon receipt of a new order."*

Expected: it names **Крамничка ПІЧ (34998)**. If it still names `dev` (51630), change it to 34998 now.

**If this is wrong at go-live, paid works are never reserved and the same one-of-a-kind painting can be sold twice.** There is no API for this setting, so this step cannot be automated or verified from code.

- [ ] **Step 2: Restore a full-access token locally**

Put the account-wide `HUGEPROFIT_API_KEY` back in `.env.local` (or re-widen the current token's warehouse access to include 34998), and **set `CRM_WAREHOUSE_ID=34998`** in the same edit. The two must always move together: a dev-scoped token with the real warehouse selected yields an empty catalogue, and a full token with `CRM_WAREHOUSE_ID=51630` serves mock works.

- [ ] **Step 3: Prove the token reaches the real shop again**

Run: `node scripts/crm-scope.mjs`

Expected: `34998` reporting **258 rows** and marked `<-- CRM_WAREHOUSE_ID`. A full-access token also reads `51630 (dev)`, and the verdict line says so — expected for production's token.

- [ ] **Step 4: Prove the app serves the real catalogue**

Run `npm run dev`, then:

```bash
curl -s http://localhost:3000/shop | grep -c '\[DEV\]'
```

Expected: `0`. Any `[DEV]` row here means `CRM_WAREHOUSE_ID` is still `51630` and Step 2 was not completed.

Then confirm the catalogue is genuinely populated:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/shop
```

Expected: `200`, and opening it in a browser shows real works.

- [ ] **Step 5: Full production build**

Run: `npm run build`

Expected: succeeds, including the "Collecting page data" phase, and prerenders real product pages rather than `[DEV]` ones.

- [ ] **Step 6: Nothing to commit**

This task changes only `.env.local`. Do not commit.

---

## Task 2: Vercel environment

**Files:**
- Vercel project settings (no repo file).

- [ ] **Step 1: Set the Production environment variables**

In the Vercel project → Settings → Environment Variables, **Production** scope:

| Key | Value |
|-----|-------|
| `WEBSITE_URL` | `https://plaipich.art` |
| `LIQPAY_PUBLIC_KEY` | the **live** public key (no `sandbox_` prefix) |
| `LIQPAY_PRIVATE_KEY` | the **live** private key |
| `HUGEPROFIT_API_KEY` | the full-access token from Task 1 Step 2 |
| `CRM_WAREHOUSE_ID` | `34998` — **required**; the site throws at import without it, and serves the wrong stock silently if it is `51630` |
| `EVENTS_SHEET_CSV_URL` | the owners' published Google Sheet CSV link, once P4 has shipped (unset = no events, no error) |

Delete `GOOGLE_CALENDAR_API_KEY` / `GOOGLE_CALENDAR_ID` if present: events are detached from the calendar (P4).

- [ ] **Step 2: Confirm the three forbidden variables are absent**

Check the Production scope contains **no** entry for:

- `LIQPAY_SANDBOX` — would make `crmPost` refuse every write, so checkout takes money and creates no order
- `DEV_ORIGIN` — dev-only, inert here, but has no business in production
- any `NEXT_PUBLIC_`-prefixed copy of a key

Expected: none present. Delete any that are.

- [ ] **Step 3: Sanity-check the LiqPay keys are the live pair**

Confirm neither key begins with `sandbox_`. A sandbox key pair in production produces a payment page that takes no real money while the site behaves as though it did.

---

## Task 3: Deploy

**Files:**
- None. `feat/payments` is already on `master`: squash-merged as `6f05794 feat: LiqPay checkout (#1)`. Its only remaining diff against `master` is dead unpaid-flow code that `master` deliberately dropped, so **do not merge `feat/payments` again**. The branch can be deleted.

- [ ] **Step 1: Confirm the working tree is clean**

```bash
git status --short
```

Expected: no output (`.env.local` is gitignored).

- [ ] **Step 2: Redeploy production with the new environment**

Environment variables only take effect on a new deployment. In Vercel → Deployments → the latest Production deployment of `master` → Redeploy (without the build cache), or push the next `master` commit.

**This is the outward-facing step of this plan:** with live keys set, the site starts taking real money. Confirm with the owners before running it.

- [ ] **Step 3: Wait for the Vercel deployment and check it did not throw**

In the Vercel dashboard, open the deployment's build log.

Expected: a successful build. If it failed naming `CRM_WAREHOUSE_ID`, the variable is missing from Production — set it to `34998` and redeploy. If it built but Step 5 below finds `[DEV]` rows, the variable is present with the wrong value.

- [ ] **Step 4: Verify the origin baked into the deployed build**

```bash
curl -s https://plaipich.art/sitemap.xml | head -5
```

Expected: URLs beginning `https://plaipich.art` — not `localhost`, not an ngrok host. The sitemap and `server_url` read the same `WEBSITE_URL`, so this is a cheap proxy for "the webhook URL is correct", which is otherwise invisible until a payment fails.

- [ ] **Step 5: Verify production serves the real shop and no mock rows**

```bash
curl -s https://plaipich.art/shop | grep -c '\[DEV\]'
```

Expected: `0`. The 54 mock rows live in warehouse 51630 and production queries 34998, so they should be structurally invisible — this confirms it rather than assuming it.

---

## Task 4: One real payment

The first real-money test. Everything verified so far ran on mock stock.

**Files:**
- No planned source changes.

- [ ] **Step 1: Pick the cheapest real work**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?limit=500&warehouse_id=34998" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).data.filter(p=>p.stock[0]&&p.stock[0].instock>0&&p.images.length).map(p=>({id:p.id,name:p.name,price:p.stock[0].sale_price>0?p.stock[0].sale_price:p.stock[0].price})).sort((a,b)=>a.price-b.price).slice(0,3);console.log(r)})"
```

Expected: three candidates. Take the cheapest — you are about to pay for it with a real card and refund it afterwards.

- [ ] **Step 2: Buy it through production**

At `https://plaipich.art`, add that work to the cart, check out with real contact details, and pay with a real card.

Expected: LiqPay's page shows the work's price in hryvnia, payment completes, and the browser returns to `/checkout/result?paymentId=…` showing "Дякуємо!" with the cart badge dropping to 0.

- [ ] **Step 3: Confirm the order reached the CRM, reserved, and is marked paid**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/remote_orders" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s).response.sort((a,b)=>(a.date_created<b.date_created?1:-1))[0];console.log(JSON.stringify({order_id:o.order_id,price:o.price,status:o.status,info:o.info,line:o.order_data[0]},null,1))})"
```

Expected, all of them: `price` equals the work's price; `status: "pending"`; `info.is_paid: true` with `payment_type: "LiqPay"`; and `order_data[0]` carrying `is_reserved: true`, `reserved_pids`, and **`mid: "34998"`**.

**`mid` is the payoff of Task 1 Step 1.** If it reads `51630`, or `is_reserved` is absent, reservation is pointed at the wrong warehouse: stop, fix the integration setting, and treat every order placed in the meantime as unreserved.

- [ ] **Step 4: Confirm the work left the shop**

```bash
curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
  "https://crm.h-profit.com/bapi/products?product_id=<the id from Step 1>&warehouse_id=34998"
```

Expected: `stock[0].instock` is one lower than before, with `quantity` unchanged — availability moves, physical stock does not, as documented at `lib/hugeprofit/map.ts:105-109`.

- [ ] **Step 5: If the buyer paid and no order appeared — the one scenario worth rehearsing**

Do not improvise this. The webhook logs every failure path with `console.error` and enough context to reconcile by hand; read Vercel's runtime logs for the deployment, filtering on `[liqpay-callback]`:

- `payload signature mismatch` → the query string was mangled in transit; the payment is real and the order must be created manually in the CRM.
- `payload/order_id mismatch` → same conclusion, different cause.
- `paid order not created — stock changed` → the work sold between payment and webhook. The buyer must be refunded; there is no automated path.
- `processing failed` → read the attached error; most likely the CRM rejecting the payload.
- **Nothing at all** → LiqPay never reached us. Check `WEBSITE_URL` in Vercel first; that is the failure Task 3 Step 4 exists to prevent.

- [ ] **Step 6: Refund and clean up**

Refund the payment in the LiqPay dashboard, then cancel or delete the order in the CRM UI.

Expected: deleting the order **releases the reservation** — the work returns to the shop. Note from the 2026-08-13 evidence in `.claude/docs/domain/checkout.md`: deletion leaves behind the auto-created client record in Клієнти, so every web order permanently adds a row there and cancelling does not clean it up.

- [ ] **Step 7: Confirm the work is buyable again**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://plaipich.art/shop
```

Then check the work's page shows it in stock, allowing up to 5 minutes for `CATALOG_REVALIDATE`.

---

## Task 5: Truth up the documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the current-state paragraph**

In `CLAUDE.md`, in the **Current state** paragraph, replace the sentence about unpaid checkout. Today it reads:

> Checkout creates real CRM orders, unpaid — the owners follow up to arrange payment (decided 2026-08-12). Still mock or missing: events (`lib/data.ts` → Google Calendar), artist bios (`artistProfiles`, empty), and online payment.

with:

> Checkout takes real payment through LiqPay and creates the CRM order from the payment webhook, live since <date of Task 4> and verified with a real purchase.

and remove "online payment" from whatever the "still mock or missing" list says at that point (P4 may already have removed events from it).

- [ ] **Step 2: Update Scope item 6**

Replace:

> 6. **Online payment** — a Ukrainian payment provider (LiqPay / monobank / Fondy / WayForPay — which one is not decided yet). Checkout must be structured so the payment step runs before order creation in the CRM.

with:

> 6. **Online payment** — BUILT: LiqPay hosted checkout, live since <date of Task 4>. Payment settles before the CRM order is created; the `server_url` webhook is the only code path that creates one. Stock reservation follows the warehouse named in the CRM integration settings, not anything this code sends.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git status
git commit -m "docs: record LiqPay checkout as live and verified"
```

Review `git status` before committing — `.env.local` must not appear.

---

## Self-Review Notes

- **Spec coverage:** the spec's payment-before-order rule is what Task 4 Step 3 confirms in production. Its Non-goals (no refund flow, no retry UX) are respected and restated. Its idempotency claim was disproved during the rehearsal and is already corrected in `.claude/docs/domain/checkout.md`; this plan does not re-litigate it.
- **Ordering rationale:** Task 1 is first because the reservation-warehouse setting is invisible to code and the only failure here that silently sells one painting twice. Task 2 precedes the merge so the deployment has its environment ready. Task 3's merge is the irreversible step and is gated on the owners. Task 4 is the only step that moves real money, and it comes last, after every cheaper check has passed.
- **No placeholders:** every step carries a real command with its expected output, or an exact document edit. The one runtime-resolved value is the product id chosen in Task 4 Step 1, which cannot be known until a full-access token exists again (Task 1).
- **Human-only steps:** Task 1 Step 1 (CRM integration settings — no API exposes it), all of Task 2 (Vercel dashboard), Task 3 Step 2 (merge, needs owner sign-off), and Task 4 Steps 2 and 6 (a real card and the LiqPay dashboard). Tasks 1 Steps 3–5, 3 Steps 1 and 4–5, and 5 are automatable.

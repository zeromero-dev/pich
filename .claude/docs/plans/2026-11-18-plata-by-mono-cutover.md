# plata by mono — Production Cutover Plan

> Work through the tasks in order. Each ends with a verify step. Tick `- [ ]` → `- [x]` as you go. Supersedes `.claude/docs/plans/2026-09-09-liqpay-production-cutover.md` (LiqPay never went live).

**Goal:** take the plata by mono checkout (branch `feat/plata-by-mono`, built and verified locally 2026-11-18) live with the owners' account, and leave the shop taking real money with a daily reconciliation in place.

**Spec:** `.claude/docs/specs/2026-11-18-plata-by-mono-design.md`. **Build plan:** `.claude/docs/plans/2026-11-18-plata-by-mono.md`.

## Global Constraints

- Payment mode is matched, not flagged: live = `VERCEL_ENV=production` + `MONO_MERCHANT_ID` + `CRM_WAREHOUSE_ID=34998`; test = elsewhere + `MONO_TEST_MERCHANT_ID` + `51630`. Anything else → `payments_disabled` and no CRM order writes.
- `WEBSITE_URL` in Production is exactly `https://www.pich.co.ua` — no trailing slash, not the apex (CLAUDE.md "Before launch" flags the current value as unconfirmed).
- `MONO_PAYLOAD_KEYS` distinct per environment. Never delete a key while invoices minted with it may still be paid (24 h) or are unreconciled.
- Never commit a token, key or tunnel URL.

## Task 1: Owners' account and production token

- [ ] Owners open/confirm their monobank business account, turn on internet acquiring in web.monobank.ua, and issue a token («Інтеграції» → «На мій сайт»). Who the legal entity is also settles the privacy policy PLACEHOLDER (`lib/info-pages.ts`).
- [ ] Read `GET https://api.monobank.ua/api/merchant/details` with that token (throwaway script, scratchpad). Record `merchantId` → `MONO_MERCHANT_ID`.
- **Verify:** `merchantId` does not start with `test_`; `edrpou` is the owners'.

## Task 2: Production HugeProfit integration (reservation warehouse 34998)

- [ ] In HugeProfit, create (or confirm) the production API integration whose reservation warehouse is **Крамничка ПІЧ (34998)** — the setting no API exposes ("select the warehouse to which the goods will be reserved upon receipt of a new order"). The current token's integration **13585** reserves into dev 51630 and stays the dev/Preview integration.
- [ ] Record its token (`HUGEPROFIT_API_KEY`, Production) and its integration id (`CRM_INTEGRATION_ID`, Production): read any order it created, or create none and read the id from the integration settings page.
- **Verify:** `node scripts/crm-scope.mjs` with the production token reports 34998 (as in the LiqPay plan's Task 1, Step 3).

## Task 3: Limits

- [ ] Ask monobank (or read the cabinet) for the terminal's per-payment limit; set `MAX_TOTAL_KOP` in `lib/mono/money.ts` to the lower of that and anything HugeProfit rejects (try a large dev order in 51630). Commit.
- [ ] Re-read `GET /bapi/products` and confirm prices still arrive with four decimals (Money rule 1 assumption).
- **Verify:** `npm test` green after the constant changes.

## Task 4: Vercel Preview rehearsal

- [ ] Push `feat/plata-by-mono` (ask first — it is the first push of this branch). Preview env: `MONO_TOKEN` = test token, `MONO_TEST_MERCHANT_ID=test_4U18rFLZus`, `MONO_PAYLOAD_KEYS` (Preview's own), `CRM_WAREHOUSE_ID=51630`, `HUGEPROFIT_API_KEY` = dev integration token, `CRM_INTEGRATION_ID=13585`, `REPORT_KEY` (Preview's own), `WEBSITE_URL` = the Preview URL.
- [ ] Create a Protection Bypass for Automation secret **for this rehearsal only**. In a temporary Preview build, append `&x-vercel-protection-bypass=<secret>` to the webhook URL before checking its byte length.
- [ ] Pay a representative large order (Task 5's `lock.test.ts` shape: 20 lines, long Cyrillic contact) with the test card. For the limit rehearsal, append an inert `&pad=` parameter to the same callback URL and size its value so `Buffer.byteLength` of the full URL, including the bypass parameter, is exactly `MAX_CALLBACK_URL_BYTES` (currently 8,000). **Verify:** record only the byte count, confirm the order lands in the dev CRM, and confirm a URL one byte longer is rejected before invoice creation. If delivery fails at the cap, lower it to a size that passes the same check.
- [ ] **No-cookie return:** pay a test invoice and open the result link in a *different* browser (no `mono_inv_` cookie). Record how many seconds until mono's statement lists the payment and until the CRM order lands. **Verify:** the page shows «Перевіряємо оплату…» then «Дякуємо!», never «Оплату не знайдено»; if the statement lags past 15 min, raise `RECENT_S` in `app/checkout/result/page.tsx`.
- [ ] Remove the temporary Preview-only bypass and padding code, then revoke the bypass secret.

## Task 5: Vercel Production env

- [ ] Set: `MONO_TOKEN` (owners'), `MONO_MERCHANT_ID`, `MONO_PAYLOAD_KEYS` (new, Production's own), `CRM_WAREHOUSE_ID=34998`, `HUGEPROFIT_API_KEY` (production integration), `CRM_INTEGRATION_ID` (production), `REPORT_KEY` (new). Remove `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX`; make sure `MONO_TEST_MERCHANT_ID` and `DEV_ORIGIN` are **not** set in Production.
- [ ] Confirm `WEBSITE_URL=https://www.pich.co.ua` exactly.
- **Verify:** after deploy (Task 7), `POST /api/checkout` with body `{}` answers 400 `invalid` (payments enabled), not 503.

## Task 6: Operator, refund period, report

- [ ] Owners name an operator and a backup, the daily check time, and the refund period (default 7 days). Hand them the link `https://www.pich.co.ua/api/payment-report?key=<REPORT_KEY>` and the procedure (spec "Operator procedure"; checkout.md).
- [ ] With the test token (local or Preview): pay a test invoice, wait 8+ days, refund it with `POST /api/merchant/invoice/cancel`, then open the default 7-day report. **Verify:** whether the refund is listed. If not, widen the default window in `reportWindow` (`lib/mono/report.ts`) to the agreed refund period (≤31 days) and commit.
- [ ] Open the report after a site purchase and a payment taken outside the site. **Verify:** the site invoice carries `Замовлення Plai Pich #<reference>` in the statement's `destination`, and the outside payment does not receive a refund instruction. If the report asks you to continue, follow its `&resume=` instruction until the window is covered.

## Task 7: Merge, deploy, one real purchase

- [ ] Remove the test-mode `[mono-callback] replay` log line (kept for the 2026-11-19 rehearsal; the spec's log rule forbids it) and its CLAUDE.md mention, after Task 4's Preview run.
- [ ] Rebase on `master`, open a PR, merge (ask first), deploy.
- [ ] Buy one cheap real work with a real card. **Verify:** paid CRM order in 34998 with `payment_type: "plata by mono"`, `order_text: "mono invoice …"`, reservation `mid: "34998"`; result page shows paid; cart cleared.
- [ ] Owners confirm that order in HugeProfit («Підтвердити замовлення» → sale) the way they will handle real orders. **Verify:** `GET /bapi/remote_orders?order_id=<ref>` now shows a non-null `sales_id` (not verified in the rehearsal — the dev account's sale form posts to a real cash account), and `info.is_paid`, `currency`, `order_text` unchanged. If they change, the report's payment-mark check (`paymentMismatch`) is already skipped for sold orders — note it here.
- [ ] Refund it in the mono cabinet; return the CRM sale. **Verify:** next day's report lists «кошти повернуто повністю (замовлення вже переведено в продаж)» with «Зробіть це один раз» — the line repeats until the payment leaves the 7-day window (by design).

## Task 8: Rollback (keep ready, don't run)

- [ ] To stop new payments: set `PAYMENTS_PAUSED=1` in Production and redeploy. Never remove `mono-callback`, `MONO_TOKEN` or payload keys while invoices from the last 24 h may still be paid; keep opening the report.

## After launch

- [ ] Rebase `feat/meta-pixel` onto `master` and port its Purchase call into `mono-callback` (spec "Handover to feat/meta-pixel").

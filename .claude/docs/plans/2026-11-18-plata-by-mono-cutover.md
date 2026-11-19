# plata by mono — Production Cutover Plan

> Production activation uses Vercel environment variables. Set them before merging to `master`, which the Vercel Git integration deploys. Supersedes `.claude/docs/plans/2026-09-09-liqpay-production-cutover.md` (LiqPay never went live).

**Goal:** take the plata by mono checkout (branch `feat/plata-by-mono`, built and verified locally 2026-11-18) live with the owners' account, and leave the shop taking real money with a daily reconciliation in place.

**Spec:** `.claude/docs/specs/2026-11-18-plata-by-mono-design.md`. **Build plan:** `.claude/docs/plans/2026-11-18-plata-by-mono.md`.

## Global Constraints

- Payment mode is matched, not flagged: live = `VERCEL_ENV=production` + `MONO_MERCHANT_ID` + `CRM_WAREHOUSE_ID=34998`; test = elsewhere + `MONO_TEST_MERCHANT_ID` + `51630`. Anything else → `payments_disabled` and no CRM order writes.
- Keep [Automatically expose System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables) enabled in Vercel so `VERCEL_ENV` is available at runtime.
- `WEBSITE_URL` in Production is exactly `https://www.pich.co.ua` — no trailing slash, not the apex (CLAUDE.md "Before launch" flags the current value as unconfirmed).
- `MONO_PAYLOAD_KEYS` distinct per environment. Never delete a key while invoices minted with it may still be paid (24 h) or are unreconciled.
- Never commit a token, key or tunnel URL.

## Task 1: Owners' account and production token

- [ ] Owners confirm their monobank business account and issue an internet-acquiring token («Інтеграції» → «На мій сайт»). Confirm the public legal name to enter as `PRIVACY_DATA_CONTROLLER`.
- [ ] Read `GET https://api.monobank.ua/api/merchant/details` with that token (throwaway script, scratchpad). Record `merchantId` → `MONO_MERCHANT_ID`.
- **Verify:** `merchantId` does not start with `test_`; `edrpou` is the owners'.

## Task 2: Production HugeProfit integration (reservation warehouse 34998)

- [ ] In HugeProfit, create (or confirm) the production API integration whose reservation warehouse is **Крамничка ПІЧ (34998)** — the setting no API exposes ("select the warehouse to which the goods will be reserved upon receipt of a new order"). The current token's integration **13585** reserves into dev 51630 and stays the dev/Preview integration.
- [ ] Record its token (`HUGEPROFIT_API_KEY`, Production) and its integration id (`CRM_INTEGRATION_ID`, Production): read any order it created, or create none and read the id from the integration settings page.
- **Verify:** supply both `HUGEPROFIT_API_KEY` and `CRM_WAREHOUSE_ID=34998` in the local process environment and run `node scripts/crm-scope.mjs`. A passing run reports products from 34998. Confirm the reservation warehouse and integration ID separately in the HugeProfit integration settings.

## Task 3: Limits

- [ ] Confirm the terminal's per-payment limit in the mono cabinet and set `MONO_MAX_TOTAL_KOP` to the lower of that limit, HugeProfit's supported amount, and `100000000` kopecks (₴1,000,000). This limit applies to new invoices. Outstanding invoices are fulfilled at their previously locked amounts.
- [ ] Confirm production CRM prices still arrive with four decimals (Money rule 1 assumption).
- **Verify:** the configured cap is a positive integer in kopecks. With the remaining required settings in place, the empty checkout smoke test in Task 5 reaches request validation.

## Task 4: Vercel Preview rehearsal

- [ ] Configure `feat/plata-by-mono` in Preview with a test `MONO_TOKEN`, its `MONO_TEST_MERCHANT_ID`, its own `MONO_PAYLOAD_KEYS` and `REPORT_KEY`, the dev `HUGEPROFIT_API_KEY`, `CRM_WAREHOUSE_ID=51630`, `CRM_INTEGRATION_ID=13585`, and `WEBSITE_URL` set to the exact Preview origin.
- [ ] If deployment protection is enabled, create a Vercel Protection Bypass for Automation secret for the rehearsal and set `MONO_PREVIEW_BYPASS_SECRET` for that branch in Preview. Checkout includes the encoded parameter in the callback URL byte count. Redeploy after changing env vars.
- [ ] Pay a representative large test order. **Verify:** the order lands in the dev CRM. The unit tests check the byte cap and cap-plus-one, including the Preview parameter. To exercise the transport at the exact cap, use mono's test API directly with an encrypted test order and an inert `&pad=` sized to reach the cap. Record only the full URL's byte count. If the platform accepts a smaller URL, set `MONO_CALLBACK_MAX_BYTES` to the tested limit.
- [ ] Open the paid result link in a different browser without the `mono_inv_` cookie. For a protected deployment, sign in to Vercel in that browser first. Verify the result shows «Дякуємо!». If more than 15 minutes elapse between link issuance and payment visibility, raise `MONO_RESULT_PENDING_MINUTES` to cover that interval.
- [ ] Remove `MONO_PREVIEW_BYPASS_SECRET` and revoke the rehearsal secret when finished.

## Task 5: Vercel Production env

| Variable | Production value |
|---|---|
| `WEBSITE_URL` | `https://www.pich.co.ua` |
| `MONO_TOKEN` | Owners' production acquiring token |
| `MONO_MERCHANT_ID` | Exact production merchant ID returned by `/api/merchant/details` |
| `MONO_MAX_TOTAL_KOP` | Confirmed payment limit from Task 3 |
| `MONO_PAYLOAD_KEYS` | Production-only JSON keyring `{"active":"k1","keys":{"k1":"<32 random bytes in base64>"}}` |
| `HUGEPROFIT_API_KEY` | Token for the production integration with reservations in warehouse 34998 |
| `CRM_INTEGRATION_ID` | ID of that same integration |
| `CRM_WAREHOUSE_ID` | `34998` |
| `REPORT_KEY` | New random secret, separate from `SYNC_KEY` |
| `PRIVACY_DATA_CONTROLLER` | Public legal name confirmed by the owners |

- [ ] Remove the old `LIQPAY_*` variables. Keep `MONO_TEST_MERCHANT_ID`, `MONO_PREVIEW_BYPASS_SECRET`, and `DEV_ORIGIN` scoped to Preview or Development as applicable. Unset `PAYMENTS_PAUSED` to enable new invoices.
- **Verify:** after deploy (Task 7), `POST /api/checkout` with body `{}` answers 400 `invalid`. This checks the checkout preflight and merchant identity without creating an invoice. Verify the CRM token and its warehouse separately in Task 2.

## Task 6: Operator, refund period, report

- [ ] Owners name an operator and a backup, the daily check time, and the refund period (default 7 days). Hand them the link `https://www.pich.co.ua/api/payment-report?key=<REPORT_KEY>` and the procedure (spec "Operator procedure"; checkout.md).
- [ ] Set `REPORT_WINDOW_DAYS` to cover the agreed refund period plus the time between report checks. For example, set 8 days for a 7-day refund period and a daily check. The supported range is 1–31 days. Use an explicit `from`/`to` range if an older refund falls outside the default window.
- [ ] Open the report after a site purchase and a payment taken outside the site. **Verify:** the site invoice carries `Замовлення Plai Pich #<reference>` in the statement's `destination`, and the outside payment does not receive a refund instruction. If the report asks you to continue, follow its `&resume=` instruction until the window is covered.

## Task 7: Merge, deploy, one real purchase

- [ ] Verify the Vercel check on PR #16 and merge once the Production variables are set. Wait for the deployment and run the empty checkout smoke test.
- [ ] Buy one cheap real work with a real card. **Verify:** paid CRM order in 34998 with `payment_type: "plata by mono"`, `order_text: "mono invoice …"`, reservation `mid: "34998"`; result page shows paid; cart cleared.
- [ ] Owners confirm that order in HugeProfit («Підтвердити замовлення» → sale) the way they will handle real orders. **Verify:** `GET /bapi/remote_orders?order_id=<ref>` now shows a non-null `sales_id` (not verified in the rehearsal — the dev account's sale form posts to a real cash account), and `info.is_paid`, `currency`, `order_text` unchanged. If they change, the report's payment-mark check (`paymentMismatch`) is already skipped for sold orders — note it here.
- [ ] Refund it in the mono cabinet and return the CRM sale. **Verify:** the next report lists «кошти повернуто повністю (замовлення вже переведено в продаж)» with «Зробіть це один раз». The line repeats while the payment is in the report window.

## Task 8: Rollback (keep ready, don't run)

- [ ] To stop new payments: set `PAYMENTS_PAUSED=1` in Production and redeploy. Never remove `mono-callback`, `MONO_TOKEN` or payload keys while invoices from the last 24 h may still be paid; keep opening the report.

## After launch

- [ ] Rebase `feat/meta-pixel` onto `master` and port its Purchase call into `mono-callback` (spec "Handover to feat/meta-pixel").

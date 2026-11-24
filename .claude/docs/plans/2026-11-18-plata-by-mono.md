# plata by mono (replaces LiqPay) Implementation Plan

> **Executed 2026-11-19** — a record of what was built then. Renamed since: `/api/checkout/reconcile` → `/api/payment-report`, `RECONCILE_KEY` → `REPORT_KEY`. Current behaviour: the spec and `.claude/docs/domain/checkout.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LiqPay with plata by mono end to end — kopeck-exact checkout, encrypted order carried in the webhook URL, a fail-closed signed webhook that creates the paid CRM order, a result page bound to the payment attempt, and a read-only reconciliation report — verified locally with the test token.

**Architecture:** Pure rules live in files with no `server-only` import (`lib/mono/money.ts`, `rules.ts`, `payload.ts`, `signature.ts`, `lib/hugeprofit/order-rules.ts`, `lib/checkout/attempt.ts`) so `npm test` can run them with `tsx`. Thin server modules (`lib/mono/client.ts`, `lib/hugeprofit/orders.ts`) do the I/O; route handlers wire them. No database: the order travels AES-GCM-encrypted in our own `webHookUrl`.

**Tech Stack:** Next.js 16.3 App Router, TypeScript, zod 4 (already a dependency), Node `crypto`, tests as plain `node:assert` files run by `npx tsx`.

**Spec:** `.claude/docs/specs/2026-11-18-plata-by-mono-design.md` (approved 2026-11-18). Read it before every task; this plan names the decisions, the spec holds the reasons.

**Scope:** branch `feat/plata-by-mono` (off `master`). Build and verify locally with the test token. **No merge, no push, no deploy** — Vercel Preview rehearsals, Production env and the real purchase belong to the mono cutover plan (Task 10 writes it).

## Global Constraints

- No new npm dependency. Node `crypto` covers signatures, encryption, and reference generation.
- Keep `MONO_TOKEN`, `MONO_PAYLOAD_KEYS`, and requests to `api.monobank.ua` server-side. No `NEXT_PUBLIC_` prefix on any new variable.
- The webhook remains the only caller of `createRemoteOrder`.
- `WEBSITE_URL` exact origin, no trailing slash (webhook URL built from it).
- Money: the unit of account is the kopeck; floats are never summed. `toKop` (Task 1) is the only float→kopeck conversion; `fromKop` (`kop / 100`) the only kopeck→decimal one.
- Payment mode is positively matched (spec "Payment mode, fail closed"): live = `VERCEL_ENV==='production'` + `merchantId===MONO_MERCHANT_ID` + `CRM_WAREHOUSE_ID==='34998'`; test = not production + `merchantId===MONO_TEST_MERCHANT_ID` + `CRM_WAREHOUSE_ID==='51630'`. Anything else: no invoices, no remote-order writes.
- Logs carry invoice ID, reference, reason, currency, expected/reported amounts, product IDs. Never buyer data, the callback URL/query, or upstream response bodies — except the test-mode replay log in Task 6, which exists only when payment mode is `test`.
- Comments: 2–3 lines max, constraints only (CLAUDE.md principle 5).
- Before `npm run build`: run `npx react-doctor@latest` and fix every finding or record a reasoned exception in `doctor.config.mjs` (CLAUDE.md).
- `next dev` regenerates `AGENTS.md`; commit it with the work if it changes.
- Never commit `.env.local`, a key, or a tunnel URL. `git status` before every commit.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RbzqhfupWE1gQvj4psUicH
  ```

## Facts already verified (don't re-probe)

| Fact | Source |
|---|---|
| Test merchant id `test_4U18rFLZus` | `GET /api/merchant/details`, 2026-11-18 |
| Our HugeProfit integration id (dev integration, reserves into 51630) `13585` | `GET /bapi/remote_orders?order_id=1793895731982`, 2026-11-18 |
| CRM readback of a line: `price: 1300`, `total: 1300` (numbers), `is_reserved: true`, `mid: "51630"` (string), `reserved_pids: [id]`; order `price: 1300`, `currency: "UAH"`, `sales_id: null`, `order_id` returned as string | same read |
| Product prices arrive as JSON numbers with four decimals (`1300.0000`) | `GET /bapi/products`, 2026-11-18 |
| `reference` ≤ 1000 chars, `destination` ≤ 280, 4030-char webhook URL delivered intact, X-Sign verifies with `crypto.verify('sha256', raw, pem, sig)` | spec table |

## Review Focus

1. **A cart saved in localStorage before the switch** (float prices, possibly a sub-kopeck one) — valid lines keep working with kopeck totals; an invalid line is dropped, not shown as ₴NaN. Test: Task 7 `migrateCart`.
2. **Test token on a misconfigured environment** (`MONO_TEST_MERCHANT_ID` unset, or `CRM_WAREHOUSE_ID=34998` locally) — checkout answers `payments_disabled`, never creates an invoice. Test: Task 3 `resolvePaymentMode` matrix.
3. **A webhook with no `X-Sign`, garbage `X-Sign`, or a body over 16 KB** — 200, logged as invalid, no CRM call. Test: Task 6 `screenRequest`.
4. **A CRM lookup that returns another integration's order with our reference** — ignored; ours is classified alone. Test: Task 4 `classifyExisting`.
5. **The result page opened without the attempt cookie** (another browser, cookie expired) — shows the pending/unknown state and never clears the cart. Test: Task 7 `cartClearDecision`.

---

### Task 1: Kopeck money rules and price display

**Files:**
- Create: `lib/mono/money.ts`
- Create: `lib/mono/money.test.ts`
- Modify: `lib/format.ts` (`formatPrice`)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces:
  - `export const MAX_TOTAL_KOP = 100_000_000` — ₴1 000 000; a placeholder until the acquiring terminal limit is confirmed (cutover plan). Comment says so.
  - `export function toKop(hryvnias: unknown): number | null` — `null` unless a finite number > 0 whose `k = Math.round(n*100)` satisfies `k/100 === n` and `k <= MAX_TOTAL_KOP`.
  - `export function fromKop(kop: number): number` — `kop / 100`.
  - `export function totalKop(lines: readonly { unitPriceKop: number; qty: number }[]): number | null` — `null` if any `unitPriceKop` or `qty` is not a positive safe integer, a line total or the running sum is not a safe integer, or the sum exceeds `MAX_TOTAL_KOP`, or `lines` is empty.
  - `export function parseCrmLineTotal(value: unknown): number | null` — kopecks from a JSON number (via `toKop`, but without the `MAX_TOTAL_KOP` cap — use an internal helper) or from the documented string `<digits>[,<1–2 digits>] грн`, digits optionally grouped by spaces/NBSP (`"1 300,00 грн"`), parsed with integer arithmetic only. Anything else → `null`.
  - `lib/format.ts`: `export function formatKop(kop: number): string` and `formatPrice(amount: number)` re-implemented as `formatKop(Math.round(amount * 100))`. Whole hryvnias render exactly as today (`₴1 200`, NBSP thousands); a fractional amount renders `₴19,99` (comma, two digits).

- [ ] **Step 1: Write the failing test** `lib/mono/money.test.ts` (plain `node:assert/strict`, header comment `// Run: npm test.`):
  ```ts
  assert.equal(toKop(19.99), 1999)
  assert.equal(toKop(1300.0), 130000)
  assert.equal(toKop(Number('19.9900')), 1999)
  assert.equal(toKop(10.005), null)          // sub-kopeck
  assert.equal(toKop(10.000000001), null)
  assert.equal(toKop(0), null); assert.equal(toKop(-5), null)
  assert.equal(toKop(NaN), null); assert.equal(toKop(Infinity), null); assert.equal(toKop('19.99'), null)
  assert.equal(toKop(1_000_000.01), null)    // above MAX_TOTAL_KOP
  assert.equal(totalKop([{ unitPriceKop: 1999, qty: 3 }]), 5997)
  assert.equal(totalKop([{ unitPriceKop: toKop(0.1)!, qty: 1 }, { unitPriceKop: toKop(0.2)!, qty: 1 }]), 30)
  assert.equal(totalKop([]), null)
  assert.equal(totalKop([{ unitPriceKop: 1.5, qty: 1 }]), null)
  assert.equal(totalKop([{ unitPriceKop: MAX_TOTAL_KOP, qty: 2 }]), null)                       // line over cap
  assert.equal(totalKop([{ unitPriceKop: Number.MAX_SAFE_INTEGER, qty: 2 }]), null)            // line overflow
  assert.equal(JSON.stringify(fromKop(5997)), '59.97')
  assert.equal(JSON.stringify(fromKop(MAX_TOTAL_KOP)), '1000000')
  assert.equal(JSON.stringify(fromKop(MAX_TOTAL_KOP - 1)), '999999.99')
  assert.equal(JSON.stringify(fromKop(1)), '0.01')
  assert.equal(parseCrmLineTotal(1300), 130000)
  assert.equal(parseCrmLineTotal('500,32 грн'), 50032)
  assert.equal(parseCrmLineTotal('1 300,00 грн'), 130000)
  assert.equal(parseCrmLineTotal('1 300,5 грн'), 130050)
  assert.equal(parseCrmLineTotal('500.32 грн'), null)
  assert.equal(parseCrmLineTotal(undefined), null)
  assert.equal(formatKop(120000), '₴1 200')
  assert.equal(formatKop(5997), '₴59,97')
  assert.equal(formatPrice(19.99), '₴19,99')
  assert.equal(formatPrice(1200), '₴1 200')
  ```
- [ ] **Step 2: Run it to make sure it fails**
  Run: `npx --yes tsx@4.19.2 lib/mono/money.test.ts`
  Expected: FAIL — `Cannot find module` for `@/lib/mono/money`.
- [ ] **Step 3: Implement `lib/mono/money.ts` and `formatKop`/`formatPrice` in `lib/format.ts`** per the Interfaces block. `formatKop` builds the string from `Math.floor(kop/100)` and `kop % 100` (no float division for display).
- [ ] **Step 4: Run it to make sure it passes**
  Run: `npx --yes tsx@4.19.2 lib/mono/money.test.ts`
  Expected: no output, exit 0.
- [ ] **Step 5: Add the file to `npm test`** — append ` && npx --yes tsx@4.19.2 lib/mono/money.test.ts` to the `test` script. Run `npm test`; expected exit 0.
- [ ] **Step 6: Commit** — `feat(mono): kopeck money rules and exact price display`.

---

### Task 2: Encrypted checkout payload, payload types, reference generator

**Files:**
- Create: `lib/mono/types.ts`
- Create: `lib/mono/payload.ts`
- Create: `lib/mono/payload.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `totalKop` (Task 1); `OrderContact` type from `lib/hugeprofit/orders.ts` (import type only — `orders.ts` is `server-only`, so re-declare the shape in `types.ts` with zod and export `OrderContact` from there; Task 4 switches `orders.ts` to import it from `@/lib/mono/types`).
- Produces (`lib/mono/types.ts`, no `server-only`):
  - `export type LockedLine = { productId: string; unitPriceKop: number; qty: number }`
  - `export const orderContactSchema` (zod: `name`, `email`, `phone`, `city`, `address`: strings; `delivery`: `DeliveryMethod`), `export type OrderContact = z.infer<typeof orderContactSchema>`
  - `export const checkoutPayloadSchema` — `{ v: z.literal(1), reference: /^\d{15}$/, lines: 1..20 of { productId: /^\d+$/, unitPriceKop: positive int, qty: int 1..99 }, totalKop: positive int, contact: orderContactSchema }`, refined so `totalKop === totalKop(lines)`.
  - `export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>`
  - `export const invoiceStatusSchema` — loose object: `invoiceId: string`, `status: string`, `amount: number`, `ccy: number`, optional `finalAmount: number`, `reference: string`, `modifiedDate: string`, `cancelList: array(unknown)`; `.passthrough()`.
  - `export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>`
- Produces (`lib/mono/payload.ts`, no `server-only`, no env reads):
  - `export type Keyring = { active: string; keys: Record<string, Buffer> }`
  - `export function parseKeyring(json: string | undefined): Keyring | null` — input `{"active":"k1","keys":{"k1":"<base64 of 32 bytes>"}}`; `null` if malformed, active key missing, or any key not 32 bytes. Key ids match `/^[a-z0-9]{1,8}$/`.
  - `export function encryptPayload(payload: CheckoutPayload, ring: Keyring): string` — AES-256-GCM, fresh 12-byte IV, AAD = key id; envelope `keyId.iv.ciphertext.tag`, binary parts base64url.
  - `export function decryptPayload(envelope: string, ring: Keyring): CheckoutPayload | null` — `null` on unknown key id, auth failure, bad JSON, or `checkoutPayloadSchema` failure.
  - `export function newReference(): string` — 15 digits, first digit 1–9, from `crypto.randomInt` (three draws: `randomInt(1,10)`, then two `randomInt(0, 10_000_000)` zero-padded to 7). `randomInt`'s range must stay below 2⁴⁸, hence the split.

- [ ] **Step 1: Write the failing test** `lib/mono/payload.test.ts`. Build a ring from two random 32-byte keys (`k1` active, `k0` old) and a valid payload (`reference` from `newReference()`, two lines, `totalKop` matching, a Cyrillic contact). Assert:
  ```ts
  assert.match(newReference(), /^[1-9]\d{14}$/)
  const env = encryptPayload(p, ring)
  assert.deepEqual(decryptPayload(env, ring), p)
  assert.equal(env.split('.').length, 4); assert.ok(env.startsWith('k1.'))
  assert.notEqual(encryptPayload(p, ring), env)                         // fresh IV
  // flip one char of the ciphertext part → null
  // replace key id 'k1' with 'k0' (AAD + key mismatch) → null
  assert.equal(decryptPayload(env, { active: 'k9', keys: { k9: randomBytes(32) } }), null)   // unknown key
  // rotation: encrypt with ring {active:'k0'}, decrypt with ring {active:'k1', keys:{k1,k0}} → equals p
  // schema: a payload whose totalKop ≠ sum → encrypt then decrypt → null
  assert.equal(parseKeyring('{"active":"k1","keys":{"k1":"c2hvcnQ="}}'), null)   // 5-byte key
  assert.equal(parseKeyring(undefined), null)
  ```
- [ ] **Step 2: Run it to make sure it fails** — `npx --yes tsx@4.19.2 lib/mono/payload.test.ts` → FAIL, module not found.
- [ ] **Step 3: Implement `lib/mono/types.ts` and `lib/mono/payload.ts`** per Interfaces.
- [ ] **Step 4: Run it to make sure it passes** — same command, exit 0.
- [ ] **Step 5: Add to `npm test`**, run `npm test`, exit 0.
- [ ] **Step 6: Commit** — `feat(mono): encrypted checkout payload and reference generator`.

---

### Task 3: monobank client, payment mode, signature verification

**Files:**
- Create: `lib/mono/signature.ts` (pure)
- Create: `lib/mono/rules.ts` (pure; this task adds `resolvePaymentMode` and `isAllowedPageUrl`, Task 6 adds more)
- Create: `lib/mono/rules.test.ts`
- Create: `lib/mono/client.ts` (`import 'server-only'`)
- Modify: `.env.local` (not committed), `.env.example`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `parseKeyring`, `Keyring` (Task 2); `invoiceStatusSchema`, `InvoiceStatus` (Task 2).
- Produces (`signature.ts`): `export function verifySignature(rawBody: Buffer, xSign: string, pem: string): boolean` — `crypto.verify('sha256', rawBody, pem, Buffer.from(xSign, 'base64'))`, `false` on any throw.
- Produces (`rules.ts`):
  - `export type PaymentMode = 'live' | 'test'`
  - `export function resolvePaymentMode(i: { vercelEnv?: string; merchantId: string | null; liveMerchantId?: string; testMerchantId?: string; warehouseId?: string }): PaymentMode | null` — exactly the two combinations in Global Constraints; empty/undefined ids never match.
  - `export const PAGE_HOSTS = ['pay.monobank.ua', 'pay.mbnk.biz']`; `export function isAllowedPageUrl(url: unknown): boolean` — `https:` and host in `PAGE_HOSTS`.
- Produces (`client.ts`, server-only):
  - `export class MonoError extends Error { constructor(message: string, readonly status?: number) }` — messages carry status/path only, never response bodies.
  - `export function payloadKeyring(): Keyring | null` — `parseKeyring(process.env.MONO_PAYLOAD_KEYS)`.
  - `export async function paymentMode(): Promise<PaymentMode | null>` — reads `GET /api/merchant/details` once per instance (cache only a successful read; a failed read → `null`, retried next call), then `resolvePaymentMode` with `process.env`.
  - `export async function checkoutEnabled(): Promise<boolean>` — `MONO_TOKEN` set, `payloadKeyring()` non-null, `PAYMENTS_PAUSED !== '1'`, `paymentMode()` non-null.
  - `export async function createInvoice(r: { amountKop: number; reference: string; destination: string; redirectUrl: string; webHookUrl: string }): Promise<{ invoiceId: string; pageUrl: string }>` — POST `/api/merchant/invoice/create` with `{ amount, ccy: 980, paymentType: 'debit', merchantPaymInfo: { reference, destination }, redirectUrl, webHookUrl }`, `cache: 'no-store'`, 10 s timeout; throws `MonoError` on non-2xx, timeout, or a response without string `invoiceId`/`pageUrl`. Never retries.
  - `export async function getInvoiceStatus(invoiceId: string): Promise<InvoiceStatus>` — GET `/api/merchant/invoice/status?invoiceId=`, no-store, parsed with `invoiceStatusSchema`; throws `MonoError`.
  - `export type StatementItem = InvoiceStatus & { date?: string }`; `export async function getStatement(fromUnix: number, toUnix: number): Promise<StatementItem[]>` — GET `/api/merchant/statement?from=&to=`, response `{ list: [...] }`; throws `MonoError`. (Step 5 confirms the field names against a live read.)
  - `export async function verifyWebhook(rawBody: Buffer, xSign: string | null): Promise<'valid' | 'invalid' | 'unavailable'>` — module-level cached PEM from `GET /api/merchant/pubkey` (`{ key }`, base64 PEM); on a failed verify, refetch at most once per 5 min per instance (one in-flight promise shared) and retry once. Missing `xSign` → `'invalid'`. Key fetch failure with no cached key → `'unavailable'`.

- [ ] **Step 1: Write the failing test** `lib/mono/rules.test.ts`:
  ```ts
  const base = { liveMerchantId: 'live_1', testMerchantId: 'test_4U18rFLZus' }
  assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'production', merchantId: 'live_1', warehouseId: '34998' }), 'live')
  assert.equal(resolvePaymentMode({ ...base, vercelEnv: 'preview', merchantId: 'test_4U18rFLZus', warehouseId: '51630' }), 'test')
  assert.equal(resolvePaymentMode({ ...base, vercelEnv: undefined, merchantId: 'test_4U18rFLZus', warehouseId: '51630' }), 'test')   // local
  // each → null:
  // test token on production; production with 51630; live id in preview; live id locally;
  // preview/local with 34998; unknown merchant id; merchantId null (failed details read);
  // testMerchantId undefined with merchantId 'test_4U18rFLZus' (unset env never matches)
  assert.equal(isAllowedPageUrl('https://pay.monobank.ua/abc'), true)
  assert.equal(isAllowedPageUrl('https://pay.mbnk.biz/abc'), true)
  assert.equal(isAllowedPageUrl('http://pay.monobank.ua/abc'), false)
  assert.equal(isAllowedPageUrl('https://pay.monobank.ua.evil.com/x'), false)
  assert.equal(isAllowedPageUrl(42), false)
  // signature: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); sign a Buffer with
  // crypto.sign('sha256', body, privateKey) → base64; export public PEM (spki/pem)
  assert.equal(verifySignature(body, sigB64, pem), true)
  assert.equal(verifySignature(Buffer.from(body.toString() + ' '), sigB64, pem), false)
  assert.equal(verifySignature(body, 'not-base64!!', pem), false)
  ```
- [ ] **Step 2: Run it to make sure it fails** — `npx --yes tsx@4.19.2 lib/mono/rules.test.ts` → FAIL.
- [ ] **Step 3: Implement `signature.ts`, `rules.ts` (two functions), `client.ts`** per Interfaces.
- [ ] **Step 4: Run it to make sure it passes**; add to `npm test`; `npm test` exit 0.
- [ ] **Step 5: Set local env and confirm against the live test API.** In `.env.local`: add `MONO_TEST_MERCHANT_ID=test_4U18rFLZus`, `CRM_INTEGRATION_ID=13585`, `RECONCILE_KEY=<32 random hex>`, `MONO_PAYLOAD_KEYS={"active":"k1","keys":{"k1":"<base64 of 32 random bytes>"}}`; remove `MONO_TEST`. Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Then run a throwaway script from the scratchpad (not committed) that calls `getStatement(now-7d, now)` and prints only the key names of the first item and of its `cancelList` entries.
  Expected: items include `invoiceId`, `status`, `amount`, `ccy`, `reference`, `date`; adjust `StatementItem` if names differ.
- [ ] **Step 6: Update `.env.example`** — replace the three `LIQPAY_*` lines with `MONO_TOKEN`, `MONO_MERCHANT_ID` (production only), `MONO_TEST_MERCHANT_ID`, `MONO_PAYLOAD_KEYS`, `CRM_INTEGRATION_ID`, `RECONCILE_KEY`, `# PAYMENTS_PAUSED=1`, each with a one-line comment from the spec's Env table.
- [ ] **Step 7: Commit** — `feat(mono): client, fail-closed payment mode, webhook signature`.

---

### Task 4: CRM order side — kopeck serialization, scoped lookup, classification, write guard

**Files:**
- Create: `lib/hugeprofit/order-rules.ts` (pure)
- Create: `lib/hugeprofit/order-rules.test.ts`
- Modify: `lib/hugeprofit/orders.ts`
- Modify: `lib/hugeprofit/client.ts` (`crmPost` guard + error text; new `crmFetchUncached`)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `fromKop`, `toKop`, `parseCrmLineTotal` (Task 1); `OrderContact` (Task 2); `paymentMode` (Task 3).
- Produces (`order-rules.ts`):
  - `export type OrderLine = { productId: string; sku: string; name: string; unitPriceKop: number; qty: number }`
  - `export type PaymentInfo = { isPaid: boolean; paymentType: string; orderText?: string }`
  - `export function buildOrderPayload(reference: string, lines: OrderLine[], contact: OrderContact, payment: PaymentInfo)` — today's payload shape (move `splitName`/`isNovaPoshta` here), with `order_id: reference` (string), `order_name: \`Замовлення з сайту #${reference}\``, `price: fromKop(total)`, `order_data[].price: fromKop(unitPriceKop)`, `order_data[].total: fromKop(unitPriceKop * qty)`.
  - `export type CrmRemoteOrder` — `{ integration_id: number; order_id: string; sales_id: number | null; price: number; currency: string; info?: { is_paid?: boolean; order_text?: string }; order_data?: { local_product_id: number; quantity: number; total?: unknown; is_reserved?: boolean; mid?: string | number }[] }`
  - `export type Expected = { reference: string; invoiceId: string; totalKop: number; lines: { productId: string; qty: number }[] }`
  - `export function classifyExisting(orders: CrmRemoteOrder[], integrationId: number, expected: Expected, warehouseId: string): 'absent' | 'recorded' | 'partial' | 'conflict'` — filter by `integration_id`; 0 → `absent`; >1 → `conflict`; one: `order_id`, `info.order_text` containing `expected.invoiceId`, `is_paid`, currency `UAH`/`грн`, `toKop(price) === totalKop` and lines equal by productId+qty (as multisets) else `conflict`; if `sales_id === null` and any line lacks `is_reserved === true` or `String(mid) !== warehouseId` → `partial`; else `recorded`.
  - `export function reservationComplete(reserved: unknown, lines: { productId: string }[], warehouseId: string): boolean` — `reserved` must be an array of `[productId, warehouseId]` pairs covering every line's product with `String(pair[1]) === warehouseId`.
  - `export function orderHealth(order: CrmRemoteOrder, warehouseId: string): string[]` — report problems (Task 8 uses it): `'total differs from line sum'` when `parseCrmLineTotal` sums differ from `toKop(price)`; `'unverifiable line totals'` when any line total decodes to `null`; `'unreserved line'` / `'reserved in wrong warehouse'` while `sales_id === null`. Empty array = healthy.
- Produces (`orders.ts`, server-only): re-exports the types; `export async function createRemoteOrder(reference: string, lines: OrderLine[], contact: OrderContact, payment: PaymentInfo): Promise<{ reservedProducts: unknown }>`; `export async function lookupRemoteOrders(reference: string): Promise<CrmRemoteOrder[]>` — `crmFetchUncached('remote_orders', { order_id: reference })`, throws `CrmError` unless `success === true` and `Array.isArray(response)`; returns all entries (callers filter via `classifyExisting`/`orderHealth`). `orderTotal` and `newOrderId` are removed.
- Produces (`client.ts`): `export async function crmFetchUncached<T>(path: 'remote_orders', params: Record<string, string>): Promise<T>` — no-store, no warehouse rule (orders aren't warehouse-scoped reads), same auth. `crmPost`: replace the `LIQPAY_SANDBOX` guard with `if (path === 'remote_orders' && !(await paymentMode())) throw new CrmError('refusing a CRM order write — payment mode check failed')`; error messages drop `text.slice(...)` (status and `body.error` key only).

- [ ] **Step 1: Write the failing test** `lib/hugeprofit/order-rules.test.ts`. Fixture `ours` = the verified readback shape (`integration_id: 13585`, `order_id: '123456789012345'`, `sales_id: null`, `price: 59.97`, `currency: 'UAH'`, `info: { is_paid: true, order_text: 'mono invoice inv1' }`, one line `{ local_product_id: 9526188, quantity: 3, total: 59.97, is_reserved: true, mid: '51630' }`) and `expected` (`totalKop: 5997`, one line `productId '9526188'`, qty 3). Assert:
  ```ts
  assert.equal(classifyExisting([], 13585, expected, '51630'), 'absent')
  assert.equal(classifyExisting([{ ...ours, integration_id: 999 }], 13585, expected, '51630'), 'absent')  // other integration ignored
  assert.equal(classifyExisting([ours], 13585, expected, '51630'), 'recorded')
  assert.equal(classifyExisting([ours, { ...ours, integration_id: 999 }], 13585, expected, '51630'), 'recorded')
  assert.equal(classifyExisting([ours, ours], 13585, expected, '51630'), 'conflict')
  assert.equal(classifyExisting([{ ...ours, price: 59.96 }], 13585, expected, '51630'), 'conflict')
  assert.equal(classifyExisting([{ ...ours, info: { is_paid: true, order_text: 'mono invoice other' } }], 13585, expected, '51630'), 'conflict')
  assert.equal(classifyExisting([withLine({ is_reserved: false })], 13585, expected, '51630'), 'partial')
  assert.equal(classifyExisting([withLine({ mid: '34998' })], 13585, expected, '51630'), 'partial')
  assert.equal(classifyExisting([{ ...withLine({ is_reserved: false }), sales_id: 77 }], 13585, expected, '51630'), 'recorded')  // converted to sale
  assert.equal(classifyExisting([{ ...ours, currency: 'грн' }], 13585, expected, '51630'), 'recorded')
  assert.equal(reservationComplete([[9526188, 51630]], [{ productId: '9526188' }], '51630'), true)
  assert.equal(reservationComplete([[9526188, 34998]], [{ productId: '9526188' }], '51630'), false)
  assert.equal(reservationComplete([], [{ productId: '9526188' }], '51630'), false)
  assert.equal(reservationComplete(undefined, [{ productId: '9526188' }], '51630'), false)
  assert.deepEqual(orderHealth(ours, '51630'), [])
  assert.deepEqual(orderHealth({ ...ours, price: 89.97 }, '51630'), ['total differs from line sum'])
  assert.deepEqual(orderHealth(withLine({ total: 'n/a' }), '51630'), ['unverifiable line totals'])
  const body = buildOrderPayload('123456789012345', [{ productId: '9526188', sku: 'A', name: 'Робота', unitPriceKop: 1999, qty: 3 }], contact, { isPaid: true, paymentType: 'plata by mono', orderText: 'mono invoice inv1' })
  const json = JSON.stringify(body)
  assert.match(json, /"order_id":"123456789012345"/)
  assert.match(json, /"price":59\.97,/)                 // order total
  assert.match(json, /"price":19\.99,/)                 // unit
  assert.match(json, /"total":59\.97,/)                 // line
  ```
- [ ] **Step 2: Run it to make sure it fails** — `npx --yes tsx@4.19.2 lib/hugeprofit/order-rules.test.ts` → FAIL.
- [ ] **Step 3: Implement `order-rules.ts`, then slim `orders.ts` and update `client.ts`** per Interfaces.
- [ ] **Step 4: Run it to make sure it passes**; add to `npm test`; `npm test` exit 0. `npx tsc --noEmit` will now fail in the LiqPay files — expected; Task 5–6 replace them.
- [ ] **Step 5: Commit** — `feat(crm): kopeck order serialization, integration-scoped lookup, mode-guarded writes`.

---

### Task 5: `/api/checkout` creates a mono invoice

**Files:**
- Create: `lib/checkout/lock.ts` (pure)
- Create: `lib/checkout/lock.test.ts`
- Modify: `app/api/checkout/route.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `toKop`, `totalKop` (Task 1); `LockedLine`, `CheckoutPayload` (Task 2); `encryptPayload`, `newReference` (Task 2); `checkoutEnabled`, `payloadKeyring`, `createInvoice`, `isAllowedPageUrl` (Task 3).
- Produces (`lock.ts`):
  - `export type FreshProduct = { id: string; inStock: boolean; available: number; price: number; name: string } | null`
  - `export type LockResult = { ok: true; lines: LockedLine[]; totalKop: number } | { ok: false; error: 'unavailable'; unavailable: string[] } | { ok: false; error: 'insufficient'; short: { workId: string; available: number }[] } | { ok: false; error: 'repriced'; repriced: { workId: string; name: string; was: number; now: number }[] } | { ok: false; error: 'invalid_price'; productIds: string[] }`
  - `export function lockLines(items: { workId: string; qty: number; price: number }[], fresh: FreshProduct[]): LockResult` — same precedence as today's route (unavailable → insufficient → invalid_price → repriced); `invalid_price` when `toKop(fresh.price)` is null or the cart total fails `totalKop`; repriced compares `toKop(item.price) !== toKop(fresh.price)`.
  - `export const MAX_CALLBACK_URL_BYTES = 8000` — provisional; the cutover plan's Preview rehearsal confirms it (Vercel's own limit is 14 KB).
  - `export function callbackUrl(origin: string, envelope: string): string | null` — `${origin}/api/checkout/mono-callback?p=${envelope}`; `null` when `Buffer.byteLength` exceeds the cap.
- Route behaviour (`POST`): `checkoutEnabled()` false → 503 `payments_disabled`. Parse/delivery/contact exactly as today. `getFreshProduct` per line, then `lockLines`; `invalid_price` → log product IDs, answer 400 `{ error: 'invalid' }` (generic error in the UI). `reference = newReference()`; `envelope = encryptPayload({ v: 1, reference, lines, totalKop, contact }, ring)`; `callbackUrl` null → log reference, 400 `{ error: 'invalid' }`. `createInvoice({ amountKop: totalKop, reference, destination: \`Замовлення Plai Pich #${reference}\`, redirectUrl: \`${WEBSITE_URL}/checkout/result?ref=${reference}\`, webHookUrl })`; any throw → log reference, 502 `{ error: 'generic' }` (no retry). `isAllowedPageUrl(pageUrl)` false → log, 502. Success: 200 `{ pageUrl, reference }` and `Set-Cookie: mono_inv_${reference}=${invoiceId}; HttpOnly; Secure; SameSite=Lax; Path=/checkout; Max-Age=86400` (via `NextResponse.cookies.set`; `secure` follows `WEBSITE_URL.startsWith('https')` so localhost works).

- [ ] **Step 1: Write the failing test** `lib/checkout/lock.test.ts`:
  ```ts
  const p = (id: string, price: number, available = 5) => ({ id, inStock: available > 0, available, price, name: 'W' + id })
  assert.deepEqual(lockLines([{ workId: '1', qty: 3, price: 19.99 }], [p('1', 19.99)]), { ok: true, lines: [{ productId: '1', unitPriceKop: 1999, qty: 3 }], totalKop: 5997 })
  assert.equal((lockLines([{ workId: '1', qty: 1, price: 10 }], [null]) as any).error, 'unavailable')
  assert.deepEqual((lockLines([{ workId: '1', qty: 6, price: 10 }], [p('1', 10, 5)]) as any).short, [{ workId: '1', available: 5 }])
  assert.equal((lockLines([{ workId: '1', qty: 1, price: 10.005 }], [p('1', 10.005)]) as any).error, 'invalid_price')
  assert.equal((lockLines([{ workId: '1', qty: 1, price: 19.99 }], [p('1', 20)]) as any).error, 'repriced')
  assert.equal(lockLines([{ workId: '1', qty: 1, price: 19.990000000000002 }], [p('1', 19.99)]).ok, true)   // same kopecks
  assert.equal(callbackUrl('https://www.pich.co.ua', 'x'.repeat(100)), 'https://www.pich.co.ua/api/checkout/mono-callback?p=' + 'x'.repeat(100))
  assert.equal(callbackUrl('https://www.pich.co.ua', 'x'.repeat(8000)), null)
  ```
  Also: a worst-case payload (two 50-char Cyrillic names, 254-char email, courier address 100+100+20+20 chars, 20 lines with 9-digit ids, qty 99) encrypted with a test ring produces a `callbackUrl` that is **not** null — proves the provisional cap fits the largest valid order.
- [ ] **Step 2: Run it to make sure it fails.**
- [ ] **Step 3: Implement `lock.ts` and rewrite `app/api/checkout/route.ts`** per the route behaviour above. Imports from `lib/liqpay` are gone from this file.
- [ ] **Step 4: Run it to make sure it passes**; add to `npm test`; `npm test` exit 0.
- [ ] **Step 5: Commit** — `feat(checkout): create mono invoices with locked kopeck lines`.

---

### Task 6: `mono-callback` webhook

**Files:**
- Modify: `lib/mono/rules.ts` (add `screenRequest`, `checkSignedEvent`, `adverseEvidence`)
- Modify: `lib/mono/rules.test.ts`
- Create: `app/api/checkout/mono-callback/route.ts`
- Delete: `app/api/checkout/liqpay-callback/route.ts`, `lib/liqpay/` (all three files)

**Interfaces:**
- Consumes: Tasks 1–4 (`totalKop`, `decryptPayload`, `invoiceStatusSchema`, `verifyWebhook`, `getInvoiceStatus`, `paymentMode`, `payloadKeyring`, `lookupRemoteOrders`, `classifyExisting`, `createRemoteOrder`, `reservationComplete`, `getFreshProduct`, `SHOP_WAREHOUSE_ID`).
- Produces (`rules.ts`):
  - `export const MAX_WEBHOOK_BYTES = 16_384`
  - `export function screenRequest(contentLength: string | null, xSign: string | null): 'ok' | 'too_large' | 'unsigned'`
  - `export function checkSignedEvent(body: InvoiceStatus, payload: CheckoutPayload): 'ok' | string` — reasons: `not success`, `missing invoiceId`, `reference mismatch`, `currency`, `amount mismatch` (`body.amount !== payload.totalKop`), `finalAmount differs` (present and ≠ `amount`), `cancelList present`.
  - `export function adverseEvidence(read: InvoiceStatus, signed: InvoiceStatus): 'ok' | string` — read must match `invoiceId`, `reference`, `ccy`, `amount` (else `status read mismatch`); `reversed`/`failure` status, `finalAmount` present and below `amount`, or non-empty `cancelList` → reason; anything else (including `created`/`processing`, missing or older `modifiedDate`) → `'ok'`.
- Route (`POST`, `export const maxDuration = 30`), in this order — each line is one decision the implementer must not reorder:
  1. `screenRequest` on headers; `too_large`/`unsigned` → log, 200. Read `Buffer.from(await request.arrayBuffer())`; if longer than `MAX_WEBHOOK_BYTES` → log, 200.
  2. `verifyWebhook(raw, xSign)`: `invalid` → log, 200; `unavailable` → 503.
  3. Parse JSON with `invoiceStatusSchema`; failure → log, 200. `status !== 'success'` → 200 (other statuses never touch the CRM).
  4. `paymentMode()` null → log, 503 (config problem; retries may land after it's fixed). In `test` mode only: `console.info('[mono-callback] replay', { p, raw, xSign })` for Task 9's replay rehearsals.
  5. `decryptPayload(p, payloadKeyring())` null → **reconciliation** log `payload unreadable`, 200.
  6. `checkSignedEvent` not ok → reconciliation log with reason, 200.
  7. `lookupRemoteOrders(reference)` throws → 503. `classifyExisting(..., Number(process.env.CRM_INTEGRATION_ID), expected, String(SHOP_WAREHOUSE_ID))`: `recorded` → 200; `partial`/`conflict` → reconciliation log, 200; `absent` → continue.
  8. `getInvoiceStatus(invoiceId)` throws → 503; `adverseEvidence(read, body)` not ok → reconciliation log, 200.
  9. `getFreshProduct` per line (throw → 503); any line with `available < qty` → reconciliation log `paid but sold out` with product IDs, 200.
  10. `createRemoteOrder(reference, lines with fresh sku/name and LOCKED unitPriceKop, contact, { isPaid: true, paymentType: 'plata by mono', orderText: \`mono invoice ${invoiceId}\` })`.
      - Throws → re-run `lookupRemoteOrders` + `classifyExisting`: `recorded` → 200; `partial`/`conflict` → reconciliation, 200; `absent` or the re-lookup throws → 503. Never a second write in this delivery.
      - Returns → `reservationComplete(reservedProducts, lines, String(SHOP_WAREHOUSE_ID))` false → reconciliation log `unreserved`, 200; true → 200.
  Reconciliation logs use one helper `reconcile(reason, fields)` → `console.error('[mono-callback] reconcile', { reason, invoiceId, reference, ccy, expectedKop, reportedKop, productIds })`.

- [ ] **Step 1: Write the failing tests** (append to `lib/mono/rules.test.ts`). With `signed = { invoiceId: 'inv1', status: 'success', amount: 5997, ccy: 980, reference: R, finalAmount: 5997 }` and a matching payload:
  ```ts
  assert.equal(screenRequest('100', 'sig'), 'ok')
  assert.equal(screenRequest('20000', 'sig'), 'too_large')
  assert.equal(screenRequest(null, null), 'unsigned')
  assert.equal(screenRequest('100', ''), 'unsigned')
  assert.equal(checkSignedEvent(signed, payload), 'ok')
  assert.equal(checkSignedEvent({ ...signed, finalAmount: undefined }, payload), 'ok')     // missing finalAmount allowed
  assert.equal(checkSignedEvent({ ...signed, reference: 'x' }, payload), 'reference mismatch')
  assert.equal(checkSignedEvent({ ...signed, ccy: 840 }, payload), 'currency')
  assert.equal(checkSignedEvent({ ...signed, amount: 5996 }, payload), 'amount mismatch')
  assert.equal(checkSignedEvent({ ...signed, finalAmount: 3000 }, payload), 'finalAmount differs')
  assert.equal(checkSignedEvent({ ...signed, cancelList: [{}] }, payload), 'cancelList present')
  assert.equal(checkSignedEvent({ ...signed, invoiceId: '' }, payload), 'missing invoiceId')
  assert.equal(adverseEvidence(signed, signed), 'ok')
  assert.equal(adverseEvidence({ ...signed, status: 'processing', modifiedDate: undefined }, signed), 'ok')   // lagging read
  assert.notEqual(adverseEvidence({ ...signed, status: 'reversed', modifiedDate: undefined }, signed), 'ok') // undated reversal
  assert.notEqual(adverseEvidence({ ...signed, finalAmount: 3000, modifiedDate: signed.modifiedDate }, signed), 'ok')  // equal-timestamp partial refund
  assert.notEqual(adverseEvidence({ ...signed, cancelList: [{ status: 'failure' }] }, signed), 'ok')          // failed cancellation
  assert.notEqual(adverseEvidence({ ...signed, invoiceId: 'other' }, signed), 'ok')
  ```
- [ ] **Step 2: Run to make sure they fail.**
- [ ] **Step 3: Implement the three rules, the route, and delete the LiqPay files.** `grep -rn liqpay app components lib` afterwards lists only copy (Task 9) and `result` files (Task 7).
- [ ] **Step 4: Run `npm test`**, exit 0.
- [ ] **Step 5: Commit** — `feat(mono): signed webhook creates the paid CRM order; remove LiqPay`.

---

### Task 7: Result page, attempt marker, cart in kopecks

**Files:**
- Create: `lib/checkout/attempt.ts` (pure)
- Create: `lib/checkout/attempt.test.ts`
- Modify: `app/checkout/result/page.tsx`, `components/checkout/result-view.tsx`
- Modify: `components/checkout/checkout-view.tsx`, `components/cart-drawer.tsx`, `components/providers.tsx`
- Modify: `lib/i18n.ts` (result strings, UA + EN)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `toKop`, `totalKop` (Task 1); `formatKop` (Task 1); `getInvoiceStatus`, `checkoutEnabled` (Task 3).
- Produces (`attempt.ts`):
  - `export type ResultStatus = 'paid' | 'pending' | 'failed' | 'expired' | 'reversed'`
  - `export function toResultStatus(read: { status: string; amount: number; finalAmount?: number; reference?: string } | null, ref: string): ResultStatus` — `null` read or `reference !== ref` → `pending`; `success` with `finalAmount` absent or equal → `paid`; `success` with a lower `finalAmount` → `reversed`; `failure` → `failed`; `expired` → `expired`; `reversed` → `reversed`; else `pending`.
  - `export const ATTEMPT_KEY = 'plai-pich-attempt'` (sessionStorage); `export type Attempt = { reference: string; fingerprint: string }`
  - `export function cartFingerprint(items: { productId: string; qty: number; unitPriceKop: number }[]): string` — sorted `productId:qty:unitPriceKop` joined by `|`.
  - `export function cartClearDecision(status: ResultStatus, ref: string, attempt: Attempt | null, currentFingerprint: string): { clear: boolean; dropAttempt: boolean }` — `clear` only if `paid` and `attempt?.reference === ref` and fingerprints equal; `dropAttempt` when the status is terminal (`paid|failed|expired|reversed`) and `attempt?.reference === ref`.
  - `export function migrateCart<T extends { product: { price: number }; qty: number }>(items: T[]): T[]` — drops items whose `toKop(product.price)` is null.
- Page (`page.tsx`, server): `searchParams.ref` must match `/^\d{15}$/` else `pending`; cookie `mono_inv_${ref}` via `cookies()`; missing → `pending`; else `getInvoiceStatus` (throw → `pending`) → `toResultStatus`. Renders `<ResultView status ref />`.
- View: reads `ATTEMPT_KEY` from sessionStorage (try/catch), computes the current fingerprint from the cart, applies `cartClearDecision`. `pending` shows the existing pending copy plus a refresh link to the same URL. `paid` copy must not claim the order is created (keep «Оплату отримано. Ми підтвердимо замовлення…»). New strings for `expired` and `reversed` (UA + EN), added to the owner-review list in Task 9.
- Checkout view: after a 200, `sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ reference, fingerprint }))` then `window.location.assign(body.pageUrl)`. Remove `redirectToLiqPay`. Line and subtotal display via `formatKop`.
- Providers: `subtotal` becomes `subtotalKop: number` (sum of `toKop(price) * qty`, lines with invalid price already dropped by `migrateCart` on load); `cart-drawer.tsx` and `checkout-view.tsx` render `formatKop(...)`.

- [ ] **Step 1: Write the failing test** `lib/checkout/attempt.test.ts`:
  ```ts
  const R = '123456789012345'
  assert.equal(toResultStatus({ status: 'success', amount: 5997, finalAmount: 5997, reference: R }, R), 'paid')
  assert.equal(toResultStatus({ status: 'success', amount: 5997, reference: R }, R), 'paid')
  assert.equal(toResultStatus({ status: 'success', amount: 5997, finalAmount: 1000, reference: R }, R), 'reversed')
  assert.equal(toResultStatus({ status: 'processing', amount: 5997, reference: R }, R), 'pending')
  assert.equal(toResultStatus({ status: 'success', amount: 5997, reference: 'other' }, R), 'pending')
  assert.equal(toResultStatus(null, R), 'pending')
  const fp = cartFingerprint([{ productId: '2', qty: 1, unitPriceKop: 100 }, { productId: '1', qty: 3, unitPriceKop: 1999 }])
  assert.equal(fp, '1:3:1999|2:1:100')
  assert.deepEqual(cartClearDecision('paid', R, { reference: R, fingerprint: fp }, fp), { clear: true, dropAttempt: true })
  assert.deepEqual(cartClearDecision('paid', R, { reference: R, fingerprint: fp }, 'edited'), { clear: false, dropAttempt: true })   // edited after return / other tab
  assert.deepEqual(cartClearDecision('paid', R, null, fp), { clear: false, dropAttempt: false })                                  // old success revisited, no cookie/attempt
  assert.deepEqual(cartClearDecision('pending', R, { reference: R, fingerprint: fp }, fp), { clear: false, dropAttempt: false })  // processing keeps the marker
  assert.deepEqual(cartClearDecision('failed', R, { reference: R, fingerprint: fp }, fp), { clear: false, dropAttempt: true })
  assert.deepEqual(cartClearDecision('paid', R, { reference: 'other', fingerprint: fp }, fp), { clear: false, dropAttempt: false })
  assert.equal(migrateCart([{ product: { price: 19.99 }, qty: 1 }, { product: { price: 10.005 }, qty: 1 }]).length, 1)
  ```
- [ ] **Step 2: Run it to make sure it fails.**
- [ ] **Step 3: Implement `attempt.ts`, the page, view, checkout view, providers, drawer, and the new i18n strings.**
- [ ] **Step 4: `npm test` exit 0; `npx tsc --noEmit` exit 0** (no LiqPay imports remain in app/components/lib).
- [ ] **Step 5: Commit** — `feat(checkout): attempt-bound result page and kopeck cart totals`.

---

### Task 8: Reconciliation report

**Files:**
- Create: `lib/mono/report.ts` (pure)
- Create: `lib/mono/report.test.ts`
- Create: `app/api/checkout/reconcile/route.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `StatementItem`, `getStatement`, `getInvoiceStatus` (Task 3); `lookupRemoteOrders`, `orderHealth`, `CrmRemoteOrder` (Task 4); `toKop` (Task 1).
- Produces (`report.ts`):
  - `export function reportWindow(from: string | null, to: string | null, now: Date): { fromUnix: number; toUnix: number } | null` — default last 7 days; `YYYY-MM-DD` params (Kyiv calendar days are fine as UTC midnight bounds — say so in the output header); `from > to` or unparsable → `null`; span over 31 days → `null` (statement API limit unverified; one month is enough for catch-up).
  - `export type Finding = { invoiceId: string; reference: string; amountKop: number; problem: string }`
  - `export function findingsFor(item: StatementItem, ours: CrmRemoteOrder[], current: { status: string; finalAmount?: number; cancelList?: unknown[] } | null, warehouseId: string): Finding[]` — `ours` is already filtered to our integration. Rules: `success` with no order → `paid, no CRM order`; more than one → `several CRM orders`; `toKop(order.price) !== item.amount` → `total differs`; every `orderHealth` problem → a finding; `current.status === 'reversed'` → `full reversal` ; `finalAmount < amount` → `partial refund`; non-empty `cancelList` while status still `success` and no `finalAmount` change → `pending cancellation`; each order-related finding gets ` (converted to sale)` when `sales_id` is set.
  - `export function renderReport(window: { fromUnix: number; toUnix: number }, checked: number, findings: Finding[]): string` — plain text: header with the window and count checked; `Все гаразд.` when empty; else one line per finding: `<problem> — інвойс <invoiceId>, ref <reference>, ₴<formatKop>`.
- Route (`GET`): `same(key, RECONCILE_KEY)` (copy the `timingSafeEqual` helper from `app/api/update-site/route.ts` into `lib/mono/report.ts` as `keyMatches`) else 403; `reportWindow` null → 400 with usage text; `getStatement` throws → 502 plain text; per item: `lookupRemoteOrders(reference)` filtered by `CRM_INTEGRATION_ID`, plus `getInvoiceStatus` only when the item or its order suggests a cancellation (`cancelList` non-empty or `status !== 'success'`); a per-item failure becomes a finding `could not check (retry)`, not a 500. Headers: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. `export const maxDuration = 60`. Never writes; never logs the URL.

- [ ] **Step 1: Write the failing test** `lib/mono/report.test.ts` — fixtures reuse Task 4's `ours` shape:
  ```ts
  assert.deepEqual(reportWindow(null, null, new Date('2026-11-18T10:00:00Z')), { fromUnix: Date.parse('2026-11-11T10:00:00Z') / 1000, toUnix: Date.parse('2026-11-18T10:00:00Z') / 1000 })
  assert.equal(reportWindow('2026-11-10', '2026-11-01', now), null)
  assert.equal(reportWindow('2026-01-01', '2026-03-01', now), null)          // > 31 days
  assert.equal(findingsFor(item, [], null, '51630')[0].problem, 'paid, no CRM order')
  assert.deepEqual(findingsFor(item, [ours], null, '51630'), [])
  assert.equal(findingsFor(item, [{ ...ours, price: 89.97 }], null, '51630')[0].problem, 'total differs')
  assert.ok(findingsFor(item, [withLine({ is_reserved: false })], null, '51630').some(f => f.problem === 'unreserved line'))
  assert.ok(findingsFor(item, [withLine({ mid: '34998' })], null, '51630').some(f => f.problem === 'reserved in wrong warehouse'))
  assert.equal(findingsFor(item, [ours], { status: 'reversed' }, '51630')[0].problem, 'full reversal')
  assert.equal(findingsFor(item, [{ ...ours, sales_id: 77 }], { status: 'reversed' }, '51630')[0].problem, 'full reversal (converted to sale)')
  assert.equal(findingsFor(item, [ours], { status: 'success', finalAmount: 1000 }, '51630')[0].problem, 'partial refund')
  assert.equal(findingsFor({ ...item, cancelList: [{}] }, [ours], { status: 'success', cancelList: [{}] }, '51630')[0].problem, 'pending cancellation')
  assert.match(renderReport(win, 3, []), /Все гаразд/)
  assert.equal(keyMatches('a', 'a'), true); assert.equal(keyMatches('a', undefined), false); assert.equal(keyMatches(null, 'a'), false)
  ```
- [ ] **Step 2: Run it to make sure it fails.**
- [ ] **Step 3: Implement `report.ts` and the route.**
- [ ] **Step 4: `npm test` exit 0.** Then `npm run dev`, open `http://localhost:3000/api/checkout/reconcile?key=<RECONCILE_KEY>`.
  Expected: 200 plain text listing the paid test invoices from the 2026-11-18 probe (invoice `261118AJY1WyjXPM9CjM`, ₴1,00) as `paid, no CRM order` — correct, they were probes. Wrong key → 403.
- [ ] **Step 5: Commit** — `feat(mono): read-only reconciliation report`.

---

### Task 9: Copy, docs, build gates

**Files:**
- Modify: `lib/i18n.ts` (`paymentNote` UA/EN), `lib/info-pages.ts` (payment list, card-data, recipients, cookie paragraphs)
- Modify: `CLAUDE.md`, `.claude/docs/domain/checkout.md`, `.claude/docs/domain/README.md`, `.claude/docs/plans/2026-09-09-liqpay-production-cutover.md` (header note only)
- Modify: `AGENTS.md` if `next dev` regenerated it

**Interfaces:** none (copy and docs).

- [ ] **Step 1: Copy.** `paymentNote`: «Ви будете перенаправлені на захищену сторінку оплати plata by mono.» / "You will be redirected to plata by mono's secure payment page." `lib/info-pages.ts`: «Оплатити замовлення можна онлайн через plata by mono:» with list «банківською карткою Visa або Mastercard;» «за допомогою Apple Pay або Google Pay.» (Privat24 removed); card-data sentence names «plata by mono»; recipient line «plata by mono (АТ «Універсал Банк») — для проведення оплати;»; cookie paragraph: «Платіжна сторінка plata by mono може використовувати власні cookie…».
- [ ] **Step 2: Docs.** `CLAUDE.md`: current-state paragraph (checkout on plata by mono; built, not live), Scope item 6, env block (Task 3's variables replace LiqPay's), Architecture lines for `lib/mono/` and the two new routes, Key Gotchas — replace the two LiqPay gotchas with: webhook URL exactness (`WEBSITE_URL`), the encrypted payload in the URL, payment mode matching, Hobby 1 h logs → the reconcile report is the record; "Before launch" list gains the owner-review strings (`expired`/`reversed` result copy, payment list) and the operator/daily-check prerequisite. `checkout.md`: rewrite "Payment" and "The flow" sections to the mono flow, keep the dated CRM evidence, add the 2026-11-18 probe facts. Domain `README.md`: LiqPay → plata by mono. Cutover plan: one line at the top «Superseded 2026-11-18 by plata by mono — see `.claude/docs/plans/2026-11-18-plata-by-mono-cutover.md`.»
- [ ] **Step 3: Gates.**
  Run: `grep -rni liqpay app components lib` → no output.
  Run: `npm test` → exit 0. `npm run lint` → exit 0. `npx react-doctor@latest` → no findings (or recorded exceptions). `npm run build` → success.
- [ ] **Step 4: Commit** — `docs(mono): copy, CLAUDE.md and checkout domain doc for plata by mono`.

---

### Task 10: Local end-to-end rehearsal with the test token, and the cutover plan

**Files:**
- Create: `.claude/docs/plans/2026-11-18-plata-by-mono-cutover.md`
- Modify: `.claude/docs/domain/checkout.md` (dated results of this rehearsal)

**Interfaces:** none.

Setup (human steps are marked **[you]**): `npm run dev`; `npx cloudflared tunnel --url http://localhost:3000` (if the npm wrapper prints nothing, run the cached `cloudflared.exe` directly with `--logfile`, as on 2026-11-18); set `WEBSITE_URL` and `DEV_ORIGIN` in `.env.local` to the tunnel URL and restart dev; browse the site **only through the tunnel URL**. **[you]** set one dev-warehouse (51630) mock work's price to **19.99** with stock ≥ 4 in the HugeProfit UI (not via API — a product POST replaces the whole record).

- [ ] **Step 1: Happy path, 3 × ₴19.99.** Checkout shows ₴19,99 per unit and ₴59,97 total; pay with `4242 4242 4242 4242`. Verify: result page "paid" and cart cleared; `[mono-callback] replay` log line present (test mode), no `reconcile` line; CRM order via `lookupRemoteOrders` throwaway script: `order_id` = the 15-digit reference (confirms width), `price: 59.97`, line `price: 19.99`, `total: 59.97`, `quantity: 3`, `is_reserved: true`, `mid: "51630"`, `order_text` contains the invoice id; product `instock` dropped by 3 (confirms multi-unit reservation — the open checkout.md question).
- [ ] **Step 2: Duplicate delivery.** Replay the logged `raw` + `xSign` to `/api/checkout/mono-callback?p=<logged p>` with `curl --data-binary`. Expected: 200, no new write (CRM `id` unchanged, `instock` unchanged).
- [ ] **Step 3: Adverse cases.** New 1-unit payment; before replaying, cancel it with `POST /api/merchant/invoice/cancel` (test token, throwaway script); replay → `reconcile` log `reversed` or `cancelList present`, no order. Pay a work, then zero its stock **[you]** before the webhook lands (pause the tunnel, zero stock, resume) → `reconcile` log `paid but sold out`.
- [ ] **Step 4: Zero delivery.** Stop the tunnel, pay a fresh invoice (the payment page is mono's, reachable without our site), wait 10 min, restart the tunnel. Open the reconcile link → that invoice listed as `paid, no CRM order`. The cancelled invoice from Step 3 listed as `full reversal`/`pending cancellation` per its state.
- [ ] **Step 5: Converted order.** **[you]** convert the Step 1 order to a sale in HugeProfit; replay Step 1's body → 200, no write; refund it (cancel API) → report lists `full reversal (converted to sale)`.
- [ ] **Step 6: Result page edges.** Return while `processing` (open the result URL immediately after paying) → pending + refresh; refresh after success → cart cleared. Pay, then edit the cart in another tab before returning → cart kept. Open an old success URL in a fresh browser profile → pending, nothing cleared.
- [ ] **Step 7: Payment-mode matrix spot check.** Locally set `CRM_WAREHOUSE_ID=34998` → checkout answers `payments_disabled`; unset `MONO_TEST_MERCHANT_ID` → same. Restore both.
- [ ] **Step 8: Restore `.env.local`** (`WEBSITE_URL=http://localhost:3000`, remove `DEV_ORIGIN`), stop the tunnel. Record each step's result with the date in `checkout.md` ("Verified locally through mono's test API 2026-11-…").
- [ ] **Step 9: Write the cutover plan** `.claude/docs/plans/2026-11-18-plata-by-mono-cutover.md` — tasks, each with a verify step: (1) owners' production token + `MONO_MERCHANT_ID` from `GET /api/merchant/details`; (2) production HugeProfit integration reserving into 34998, its `CRM_INTEGRATION_ID`, and the full-access token with `CRM_WAREHOUSE_ID=34998` (carry over Task 1 of the LiqPay cutover plan); (3) confirm the acquiring terminal amount limit and set `MAX_TOTAL_KOP`; re-check four-decimal CRM prices; (4) push the branch, Vercel Preview env (test token, `MONO_TEST_MERCHANT_ID`, dev integration), protection-bypass secret created for the rehearsal only, callback at the `MAX_CALLBACK_URL_BYTES` cap with a worst-case order, then revoke the secret; (5) Vercel Production env (`MONO_*`, `RECONCILE_KEY`, `CRM_INTEGRATION_ID`, payload keys distinct from Preview; remove `LIQPAY_*`; confirm `WEBSITE_URL=https://www.pich.co.ua` exactly); (6) owners name the operator + backup, refund period, and get the reconcile link; refund a test purchase that is 8+ days old and confirm whether the default 7-day statement window still lists the refund (spec: "Verify in test before launch") — if not, widen the default window to the agreed refund period; (7) merge, deploy, one real purchase, refund it in the mono cabinet, confirm the next report shows it; (8) rollback = `PAYMENTS_PAUSED=1`.
- [ ] **Step 10: Commit** — `docs(mono): local rehearsal results and cutover plan`.

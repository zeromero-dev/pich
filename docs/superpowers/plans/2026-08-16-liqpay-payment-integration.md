# LiqPay Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current unpaid-checkout flow with a real LiqPay payment: buyer pays on LiqPay's hosted page before a CRM order is ever created.

**Architecture:** `POST /api/checkout` validates the cart (unchanged logic) and returns a signed LiqPay checkout request instead of creating an order. The buyer's browser auto-submits to LiqPay. LiqPay's `server_url` webhook (`POST /api/checkout/liqpay-callback`) is the *sole* place a CRM order gets created, once payment is verified — this avoids both double-creating an order and silently losing a paid one. The buyer's redirect target (`/checkout/result`) does a read-only status check purely for the confirmation message; it never touches the CRM.

**Tech Stack:** Next.js 16 App Router route handlers, Node's built-in `crypto`/`Buffer` (no new dependency). No test framework exists in this repo (deliberate — see spec Non-goals); verification is `npm run build` (typecheck) after each task plus a real LiqPay **sandbox** run at the end.

**Spec:** `docs/superpowers/specs/2026-08-16-liqpay-payment-design.md`

## Global Constraints

- No new npm dependencies — signing uses Node's stdlib `crypto`/`Buffer` only.
- No database — payment-in-flight state travels in LiqPay's own request/callback round trip, not server storage.
- Env vars are server-only, no `NEXT_PUBLIC_` prefix: `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, `LIQPAY_SANDBOX` (`"1"` to enable sandbox mode).
- `qty` is always `1` per work (existing rule, unchanged) — `MAX_ITEMS = 20` cap on cart size (unchanged).
- The webhook is the only code path allowed to call `createRemoteOrder` for a paid order. Nothing else creates CRM orders.
- Comments: 2–3 lines max, constraints only — no narration of what code already shows.

**Deviations from the spec, found while planning (both are simplifications, not behavior changes — noted for the record, not re-approval):**
1. The spec's `GET /api/checkout/liqpay-status` route is dropped. `/checkout/result` is a Server Component and can call `checkStatus()` directly — no same-origin API hop needed.
2. The webhook payload carries only `{ productId, price, qty }` per line (not `name`/`sku`) to keep the `server_url` query string short for a 20-item cart. The webhook re-fetches `name`/`sku` from `getFreshProduct` (already calling it for the stock re-check) and combines it with the *locked* `price` from the payload.

---

## Task 1: LiqPay signing core

**Files:**
- Create: `lib/liqpay/types.ts`
- Create: `lib/liqpay/client.ts`

**Interfaces:**
- Consumes: nothing new (env vars only)
- Produces: `sign(data: string): string`, `buildCheckoutRequest(params): { data: string; signature: string; checkoutUrl: string }`, `verifyCallback(data: string, signature: string): boolean`, `decodeCallback(data: string): LiqPayCallbackData`, `checkStatus(orderId: number): Promise<LiqPayStatus>` — all consumed by later tasks.

- [ ] **Step 1: Write `lib/liqpay/types.ts`**

```ts
import type { OrderContact } from '@/lib/hugeprofit/orders'

/** What travels in the server_url query string — kept lean, see plan header. */
export type LockedLine = {
  productId: string
  price: number
  qty: number
}

export type CheckoutPayload = {
  lines: LockedLine[]
  contact: OrderContact
}

export type LiqPayCallbackData = {
  order_id: string
  status: string
  [key: string]: unknown
}

export type LiqPayStatus = 'success' | 'sandbox' | 'failure' | 'pending' | 'unknown'
```

- [ ] **Step 2: Write `lib/liqpay/client.ts`**

```ts
import 'server-only'
import { createHash } from 'node:crypto'
import type { LiqPayCallbackData, LiqPayStatus } from './types'

/**
 * Signature algorithm and endpoints per LiqPay's published PHP SDK —
 * see spec for sourcing. Not yet exercised against a live account.
 */
const CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout'
const REQUEST_URL = 'https://www.liqpay.ua/api/request'

function publicKey(): string {
  const value = process.env.LIQPAY_PUBLIC_KEY
  if (!value) throw new Error('LIQPAY_PUBLIC_KEY is not set — add it to .env.local')
  return value
}

function privateKey(): string {
  const value = process.env.LIQPAY_PRIVATE_KEY
  if (!value) throw new Error('LIQPAY_PRIVATE_KEY is not set — add it to .env.local')
  return value
}

function isSandbox(): boolean {
  return process.env.LIQPAY_SANDBOX === '1'
}

export function sign(data: string): string {
  const key = privateKey()
  return createHash('sha1').update(key + data + key).digest('base64')
}

function encodeParams(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params)).toString('base64')
}

export function buildCheckoutRequest(params: {
  orderId: number
  amount: number
  description: string
  resultUrl: string
  serverUrl: string
}): { data: string; signature: string; checkoutUrl: string } {
  const body: Record<string, unknown> = {
    public_key: publicKey(),
    version: 3,
    action: 'pay',
    amount: params.amount,
    currency: 'UAH',
    order_id: String(params.orderId),
    description: params.description,
    result_url: params.resultUrl,
    server_url: params.serverUrl,
  }
  if (isSandbox()) body.sandbox = 1

  const data = encodeParams(body)
  return { data, signature: sign(data), checkoutUrl: CHECKOUT_URL }
}

export function verifyCallback(data: string, signature: string): boolean {
  return sign(data) === signature
}

export function decodeCallback(data: string): LiqPayCallbackData {
  return JSON.parse(Buffer.from(data, 'base64').toString('utf-8'))
}

function toLiqPayStatus(status: string | undefined): LiqPayStatus {
  if (status === 'success' || status === 'sandbox') return status
  if (status === 'failure' || status === 'error') return 'failure'
  if (!status) return 'unknown'
  return 'pending'
}

/** Read-only status lookup — used for buyer-facing display only, never to create an order. */
export async function checkStatus(orderId: number): Promise<LiqPayStatus> {
  const body = {
    public_key: publicKey(),
    version: 3,
    action: 'status',
    order_id: String(orderId),
  }
  const data = encodeParams(body)
  const signature = sign(data)

  const res = await fetch(REQUEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data, signature }),
    cache: 'no-store',
  })
  if (!res.ok) return 'unknown'

  const json = (await res.json()) as { status?: string }
  return toLiqPayStatus(json.status)
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds (these files aren't imported anywhere yet, so this only confirms they compile in isolation — real exercise happens in Task 4/6).

- [ ] **Step 4: Commit**

```bash
git add lib/liqpay/types.ts lib/liqpay/client.ts
git commit -m "feat: add LiqPay signing and status-check client"
```

---

## Task 2: Payload encode/decode helpers

**Files:**
- Create: `lib/liqpay/payload.ts`

**Interfaces:**
- Consumes: `CheckoutPayload` from `lib/liqpay/types.ts` (Task 1)
- Produces: `encodePayload(payload: CheckoutPayload): string`, `decodePayload(encoded: string): CheckoutPayload` — consumed by Task 4 (encode) and Task 6 (decode)

- [ ] **Step 1: Write `lib/liqpay/payload.ts`**

```ts
import 'server-only'
import type { CheckoutPayload } from './types'

export function encodePayload(payload: CheckoutPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodePayload(encoded: string): CheckoutPayload {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'))
}
```

- [ ] **Step 2: Verify round-trip manually**

Run: `node -e "const p = Buffer.from(JSON.stringify({lines:[{productId:'1',price:100,qty:1}],contact:{name:'Test',email:'a@b.com',phone:'1',city:'Kyiv',address:'x'}})).toString('base64url'); console.log(p.length, JSON.parse(Buffer.from(p,'base64url').toString('utf-8')))"`
Expected: prints a length under ~200 for one line, and the decoded object matches the input — confirms the encoding round-trips before it's wired into a URL.

- [ ] **Step 3: Commit**

```bash
git add lib/liqpay/payload.ts
git commit -m "feat: add LiqPay payload encode/decode helpers"
```

---

## Task 3: Parameterize order creation with payment info

**Files:**
- Modify: `lib/hugeprofit/orders.ts`
- Modify: `app/api/checkout/route.ts` (only to fix the now-broken import — full rewrite happens in Task 4, this step just keeps the build green)

**Interfaces:**
- Consumes: nothing new
- Produces: `OrderLine = { productId: string; sku: string; name: string; price: number; qty: number }` (replaces the old `{ product: Product; qty: number }` shape), `PaymentInfo = { isPaid: boolean; paymentType: string; orderText?: string }`, `createRemoteOrder(orderId, lines, contact, payment)` — consumed by Task 6.

- [ ] **Step 1: Confirm nothing else imports the old `OrderLine` shape**

Run: `grep -rn "OrderLine" --include="*.ts" --include="*.tsx" app lib components`
Expected: only `lib/hugeprofit/orders.ts` and `app/api/checkout/route.ts` — if anything else shows up, stop and re-scope this task.

- [ ] **Step 2: Rewrite `lib/hugeprofit/orders.ts`**

```ts
import 'server-only'

import { crmPost } from './client'

/**
 * Order creation against `POST /bapi/remote_orders`. Field shapes are from the
 * API docs — this endpoint has never been exercised against the live account,
 * which had zero remote orders as of 2026-08-12.
 */

export type OrderContact = {
  name: string
  email: string
  phone: string
  city: string
  address: string
}

export type OrderLine = {
  productId: string
  sku: string
  name: string
  price: number
  qty: number
}

export type PaymentInfo = {
  isPaid: boolean
  paymentType: string
  orderText?: string
}

export type CreatedOrder = {
  orderId: number
  total: number
}

type RemoteOrderResponse = {
  success?: boolean
  reservedProducts?: [number, string][]
}

/**
 * `order_id` is documented as an int, so no UUID. Milliseconds are unique
 * enough: we are the only writer and orders are minutes apart at best.
 */
export function newOrderId(now: number): number {
  return now
}

/** `first_name` is required; the form collects one combined name field. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  return {
    first: parts[0] ?? '',
    last: parts.slice(1).join(' '),
  }
}

export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0)
}

export function buildOrderPayload(
  orderId: number,
  lines: OrderLine[],
  contact: OrderContact,
  payment: PaymentInfo,
) {
  const { first, last } = splitName(contact.name)
  return {
    data: {
      order_id: orderId,
      order_name: `Замовлення з сайту #${orderId}`,
      price: orderTotal(lines),
      currency: 'UAH',
      status: 'pending',
      first_name: first,
      last_name: last,
      phone: contact.phone,
      email: contact.email,
      address_1: {
        address_1: contact.address,
        city: contact.city,
        // Always 0 — the site does not price delivery (checkout.md).
        delivery_cost: 0,
      },
      info: {
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
        ...(payment.orderText ? { order_text: payment.orderText } : {}),
      },
      order_data: lines.map((line) => ({
        // `product_id` is the *marketplace* remote id; ours live in HugeProfit,
        // so the docs say to send null here and identify by local_product_id.
        product_id: null,
        local_product_id: Number(line.productId),
        id: Number(line.productId),
        name: line.name,
        sku: line.sku,
        quantity: line.qty,
        price: line.price,
        total: line.price * line.qty,
        is_paid: payment.isPaid,
        payment_type: payment.paymentType,
      })),
    },
  }
}

export async function createRemoteOrder(
  orderId: number,
  lines: OrderLine[],
  contact: OrderContact,
  payment: PaymentInfo,
): Promise<CreatedOrder> {
  const payload = buildOrderPayload(orderId, lines, contact, payment)
  await crmPost<RemoteOrderResponse>('remote_orders', payload)
  return { orderId, total: orderTotal(lines) }
}
```

- [ ] **Step 3: Typecheck (expect a failure in `app/api/checkout/route.ts`)**

Run: `npm run build`
Expected: FAILS — `app/api/checkout/route.ts` still references the old `OrderLine`/`createRemoteOrder` shape. This is expected; Task 4 fixes it. Confirm the *only* errors reported are in `app/api/checkout/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/hugeprofit/orders.ts
git commit -m "refactor: parameterize order payload with payment info"
```

(Leave `app/api/checkout/route.ts` broken — Task 4 is the very next task and rewrites it. Do not commit a throwaway fix here.)

---

## Task 4: Repurpose `/api/checkout` to initiate payment

**Files:**
- Modify: `app/api/checkout/route.ts`

**Interfaces:**
- Consumes: `getFreshProduct` (`lib/hugeprofit`), `buildCheckoutRequest` (Task 1), `encodePayload` (Task 2), `newOrderId` (Task 3), `WEBSITE_URL` (`lib/site`)
- Produces: `POST /api/checkout` now returns `{ checkoutUrl, data, signature }` (200) instead of `{ orderId, total }` — Task 5 consumes this shape.

- [ ] **Step 1: Rewrite `app/api/checkout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { buildCheckoutRequest } from '@/lib/liqpay/client'
import { encodePayload } from '@/lib/liqpay/payload'
import { newOrderId, type OrderContact } from '@/lib/hugeprofit/orders'
import type { LockedLine } from '@/lib/liqpay/types'
import { WEBSITE_URL } from '@/lib/site'

/**
 * Validates the cart against fresh CRM data (unchanged from the unpaid flow)
 * and returns a signed LiqPay checkout request. No CRM order is created here
 * — that only happens in the liqpay-callback webhook, once payment clears.
 */

type RequestLine = { workId: string; qty: number; price: number }

type CheckoutRequest = {
  items: RequestLine[]
  contact: OrderContact
}

const MAX_ITEMS = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 })
}

function parse(body: unknown): CheckoutRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const { items, contact } = body as Partial<CheckoutRequest>

  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null
  for (const item of items) {
    if (typeof item?.workId !== 'string' || !item.workId) return null
    if (item.qty !== 1) return null
    if (typeof item.price !== 'number' || !Number.isFinite(item.price)) return null
  }

  if (typeof contact !== 'object' || contact === null) return null
  const fields = ['name', 'email', 'phone', 'city', 'address'] as const
  for (const field of fields) {
    const value = contact[field]
    if (typeof value !== 'string' || !value.trim()) return null
    if (value.length > 300) return null
  }
  if (!EMAIL.test(contact.email.trim())) return null

  return {
    items,
    contact: {
      name: contact.name.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      city: contact.city.trim(),
      address: contact.address.trim(),
    },
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('invalid')
  }

  const parsed = parse(body)
  if (!parsed) return badRequest('invalid')

  const ids = parsed.items.map((i) => i.workId)
  if (new Set(ids).size !== ids.length) return badRequest('invalid')

  // Checkout-time truth: bypasses the 5-minute catalog cache, one call per line
  // because `product_id` rejects a comma list.
  const fresh = await Promise.all(parsed.items.map((i) => getFreshProduct(i.workId)))

  const unavailable: string[] = []
  const repriced: { workId: string; name: string; was: number; now: number }[] = []
  const lines: LockedLine[] = []

  parsed.items.forEach((item, index) => {
    const product = fresh[index]
    if (!product || !product.inStock) {
      unavailable.push(item.workId)
      return
    }
    if (product.price !== item.price) {
      repriced.push({
        workId: item.workId,
        name: product.name,
        was: item.price,
        now: product.price,
      })
      return
    }
    lines.push({ productId: product.id, price: product.price, qty: 1 })
  })

  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'unavailable', unavailable }, { status: 409 })
  }
  if (repriced.length > 0) {
    return NextResponse.json({ error: 'repriced', repriced }, { status: 409 })
  }

  const paymentId = newOrderId(Date.now())
  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const payload = encodePayload({ lines, contact: parsed.contact })

  const { checkoutUrl, data, signature } = buildCheckoutRequest({
    orderId: paymentId,
    amount: total,
    description: `Замовлення Plai Pich #${paymentId}`,
    resultUrl: `${WEBSITE_URL}/checkout/result?paymentId=${paymentId}`,
    serverUrl: `${WEBSITE_URL}/api/checkout/liqpay-callback?payload=${payload}`,
  })

  return NextResponse.json({ checkoutUrl, data, signature }, { status: 200 })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds — this was the only file with errors after Task 3.

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/route.ts
git commit -m "feat: repurpose /api/checkout to initiate a LiqPay payment"
```

---

## Task 5: Checkout UI redirects to LiqPay

**Files:**
- Modify: `components/checkout/checkout-view.tsx`
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: `POST /api/checkout` response shape `{ checkoutUrl, data, signature }` (Task 4)
- Produces: nothing new consumed elsewhere — this is a leaf UI change

- [ ] **Step 1: Update `lib/i18n.ts` — Ukrainian `checkout` block**

Replace lines 103–124 (the `checkout:` object under the `uk` dictionary) with:

```ts
    checkout: {
      title: 'Оформлення',
      contact: 'Контактні дані',
      name: 'Імʼя та прізвище',
      email: 'Email',
      phone: 'Телефон',
      delivery: 'Доставка',
      city: 'Місто',
      address: 'Відділення / адреса',
      payment: 'Оплата',
      paymentNote: 'Ви будете перенаправлені на захищену сторінку оплати LiqPay.',
      summary: 'Ваше замовлення',
      place: 'Перейти до оплати',
      required: 'Обовʼязкове поле',
      invalidEmail: 'Некоректний email',
      resultPendingTitle: 'Перевіряємо оплату…',
      resultPendingBody: 'Це займає кілька секунд.',
      resultSuccessTitle: 'Дякуємо!',
      resultSuccessBody: 'Оплату отримано. Ми підтвердимо замовлення та звʼяжемося з вами щодо доставки.',
      resultFailedTitle: 'Оплата не пройшла',
      resultFailedBody: 'Спробуйте ще раз або звʼяжіться з нами.',
      backToCart: 'Повернутися до кошика',
      errorUnavailable: 'На жаль, роботу вже придбали. Поверніться до кошика й приберіть її, щоб оформити решту.',
      errorRepriced: 'Ціна змінилася, поки ви оформлювали замовлення. Поверніться до кошика — ми покажемо актуальну ціну.',
      errorGeneric: 'Не вдалося оформити замовлення. Спробуйте ще раз або звʼяжіться з нами.',
    },
```

- [ ] **Step 2: Update `lib/i18n.ts` — English `checkout` block**

Replace lines 234–255 (the `checkout:` object under the `en` dictionary) with:

```ts
    checkout: {
      title: 'Checkout',
      contact: 'Contact details',
      name: 'Full name',
      email: 'Email',
      phone: 'Phone',
      delivery: 'Delivery',
      city: 'City',
      address: 'Branch / address',
      payment: 'Payment',
      paymentNote: 'You will be redirected to LiqPay’s secure payment page.',
      summary: 'Your order',
      place: 'Proceed to payment',
      required: 'Required field',
      invalidEmail: 'Invalid email',
      resultPendingTitle: 'Confirming payment…',
      resultPendingBody: 'This takes a few seconds.',
      resultSuccessTitle: 'Thank you!',
      resultSuccessBody: 'Payment received. We will confirm your order and reach out about delivery.',
      resultFailedTitle: 'Payment failed',
      resultFailedBody: 'Please try again or get in touch.',
      backToCart: 'Back to cart',
      errorUnavailable: 'That work has just been sold. Go back to the cart and remove it to order the rest.',
      errorRepriced: 'The price changed while you were checking out. Go back to the cart to see the current price.',
      errorGeneric: 'We could not place the order. Please try again or get in touch.',
    },
```

- [ ] **Step 3: Update `components/checkout/checkout-view.tsx`**

Remove the `orderId` state and the success-screen block (lines 28, 94, 103–129 in the current file), and replace the submit handler and the payment `fieldset` stub. Full new contents:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import { PillButton, PillLink } from '@/components/pill-button'
import { cn } from '@/lib/utils'

type Fields = 'name' | 'email' | 'phone' | 'city' | 'address'

function redirectToLiqPay(checkoutUrl: string, data: string, signature: string) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = checkoutUrl
  for (const [name, value] of [
    ['data', data],
    ['signature', signature],
  ]) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export function CheckoutView() {
  const { t } = useLocale()
  const { items, subtotal } = useCart()
  const [values, setValues] = useState<Record<Fields, string>>({
    name: '',
    email: '',
    phone: '',
    city: '',
    address: '',
  })
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validateField = (field: Fields, value: string): string | undefined => {
    if (!value.trim()) return t.checkout.required
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return t.checkout.invalidEmail
    }
    return undefined
  }

  const setField = (field: Fields, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    // Re-validate on change only after the first error ("reward early, punish late").
    if (touched[field]) {
      setErrors((e) => ({ ...e, [field]: validateField(field, value) }))
    }
  }

  const onBlur = (field: Fields) => {
    setTouched((tc) => ({ ...tc, [field]: true }))
    setErrors((e) => ({ ...e, [field]: validateField(field, values[field]) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fields: Fields[] = ['name', 'email', 'phone', 'city', 'address']
    const nextErrors: Partial<Record<Fields, string>> = {}
    fields.forEach((f) => {
      const err = validateField(f, values[f])
      if (err) nextErrors[f] = err
    })
    setErrors(nextErrors)
    setTouched(Object.fromEntries(fields.map((f) => [f, true])))
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ product, qty }) => ({
            workId: product.id,
            qty,
            price: product.price,
          })),
          contact: values,
        }),
      })
      const body = await res.json()

      if (!res.ok) {
        setSubmitError(
          body?.error === 'unavailable'
            ? t.checkout.errorUnavailable
            : body?.error === 'repriced'
              ? t.checkout.errorRepriced
              : t.checkout.errorGeneric,
        )
        setSubmitting(false)
        return
      }

      // Full-page navigation to LiqPay — cart stays in localStorage until
      // /checkout/result clears it on confirmed payment.
      redirectToLiqPay(body.checkoutUrl, body.data, body.signature)
    } catch {
      setSubmitError(t.checkout.errorGeneric)
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.cart.empty}</h1>
        <p className="mt-3 text-base text-ink-soft">{t.cart.emptyBody}</p>
        <PillLink href="/shop" className="mt-8">
          {t.cart.continue}
        </PillLink>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/shop"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        {t.shop.backToShop}
      </Link>

      <h1 className="mt-6 text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-4xl">
        {t.checkout.title}
      </h1>

      <section className="mt-8 rounded-2xl bg-surface-alt p-5">
        <h2 className="text-sm font-semibold text-ink">{t.checkout.summary}</h2>
        <ul className="mt-4 divide-y divide-hairline">
          {items.map(({ product, qty }) => (
            <li key={product.id} className="flex items-center gap-4 py-3">
              <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                <img
                  src={product.images[0] || '/placeholder.svg'}
                  alt={product.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-contain p-1"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                <p className="text-xs text-ink-soft">
                  {qty} × {formatPrice(product.price)}
                </p>
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {formatPrice(product.price * qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
          <span className="text-sm text-ink-soft">{t.cart.subtotal}</span>
          <span className="text-xl font-semibold text-ink tabular-nums">{formatPrice(subtotal)}</span>
        </div>
      </section>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.contact}</legend>
          <Field id="name" label={t.checkout.name} value={values.name} error={errors.name}
            onChange={(v) => setField('name', v)} onBlur={() => onBlur('name')} autoComplete="name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label={t.checkout.email} type="email" value={values.email} error={errors.email}
              onChange={(v) => setField('email', v)} onBlur={() => onBlur('email')} autoComplete="email" />
            <Field id="phone" label={t.checkout.phone} type="tel" value={values.phone} error={errors.phone}
              onChange={(v) => setField('phone', v)} onBlur={() => onBlur('phone')} autoComplete="tel" />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.delivery}</legend>
          <Field id="city" label={t.checkout.city} value={values.city} error={errors.city}
            onChange={(v) => setField('city', v)} onBlur={() => onBlur('city')} autoComplete="address-level2" />
          <Field id="address" label={t.checkout.address} value={values.address} error={errors.address}
            onChange={(v) => setField('address', v)} onBlur={() => onBlur('address')} autoComplete="street-address" />
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.payment}</legend>
          <div className="mt-3 rounded-2xl border border-hairline bg-surface-alt/60 p-5 text-sm leading-relaxed text-ink-soft">
            {t.checkout.paymentNote}
          </div>
        </fieldset>

        {submitError && (
          <p
            role="alert"
            className="rounded-2xl border border-ink/15 bg-surface-alt px-5 py-4 text-sm leading-relaxed text-ink"
          >
            {submitError}
          </p>
        )}

        <PillButton type="submit" size="hero" disabled={submitting} className="w-full">
          {submitting ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-surface/30 border-t-surface" aria-hidden="true" />
          ) : (
            t.checkout.place
          )}
        </PillButton>
      </form>
    </main>
  )
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (v: string) => void
  onBlur: () => void
  type?: string
  autoComplete?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'h-11 rounded-full border bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint',
          error
            ? 'border-error focus:border-error'
            : 'border-ink/15 focus:border-ink',
        )}
      />
      {error && (
        <p id={`${id}-error`} className="pl-1 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: succeeds. `motion`, `Check`, `spring`, `LogoMark` imports were dropped along with the inline success screen — confirm no unused-import lint errors (`npm run lint`).

- [ ] **Step 5: Commit**

```bash
git add components/checkout/checkout-view.tsx lib/i18n.ts
git commit -m "feat: redirect checkout to LiqPay instead of creating an order inline"
```

---

## Task 6: LiqPay webhook creates the order

**Files:**
- Create: `app/api/checkout/liqpay-callback/route.ts`

**Interfaces:**
- Consumes: `verifyCallback`, `decodeCallback` (Task 1), `decodePayload` (Task 2), `createRemoteOrder` + `OrderLine` (Task 3), `getFreshProduct` (`lib/hugeprofit`)
- Produces: nothing consumed elsewhere — this is the terminal write path

- [ ] **Step 1: Write `app/api/checkout/liqpay-callback/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getFreshProduct } from '@/lib/hugeprofit'
import { verifyCallback, decodeCallback } from '@/lib/liqpay/client'
import { decodePayload } from '@/lib/liqpay/payload'
import { createRemoteOrder, type OrderLine } from '@/lib/hugeprofit/orders'

/**
 * LiqPay's server_url webhook — the only place a CRM order is created for a
 * paid checkout. Cart lines + contact travel in this URL's own query string
 * (see plan Task 4); LiqPay's signed POST body only carries payment status.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const encodedPayload = searchParams.get('payload')
  if (!encodedPayload) return new NextResponse(null, { status: 400 })

  const form = await request.formData()
  const data = form.get('data')
  const signature = form.get('signature')
  if (typeof data !== 'string' || typeof signature !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  if (!verifyCallback(data, signature)) {
    console.error('[liqpay-callback] signature mismatch')
    return new NextResponse(null, { status: 401 })
  }

  const callback = decodeCallback(data)
  if (callback.status !== 'success' && callback.status !== 'sandbox') {
    return new NextResponse(null, { status: 200 })
  }

  const orderId = Number(callback.order_id)
  const { lines: locked, contact } = decodePayload(encodedPayload)

  const fresh = await Promise.all(locked.map((line) => getFreshProduct(line.productId)))
  const stillAvailable = fresh.every((product) => product?.inStock)

  if (!stillAvailable) {
    // Paid but sold out in the meantime — no automated refund exists.
    // Loud on purpose: this needs a human, never silently swallowed.
    console.error('[liqpay-callback] paid order not created — stock changed', {
      orderId,
      productIds: locked.map((l) => l.productId),
    })
    return new NextResponse(null, { status: 200 })
  }

  const lines: OrderLine[] = locked.map((line, index) => {
    const product = fresh[index]!
    return {
      productId: line.productId,
      sku: product.sku ?? '',
      name: product.name,
      price: line.price, // the price actually charged, not the (possibly stale) fresh price
      qty: line.qty,
    }
  })

  try {
    await createRemoteOrder(orderId, lines, contact, {
      isPaid: true,
      paymentType: 'LiqPay',
      orderText: `LiqPay order_id ${callback.order_id}`,
    })
  } catch (error) {
    console.error('[liqpay-callback] order creation failed after payment', { orderId, error })
  }

  return new NextResponse(null, { status: 200 })
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/liqpay-callback/route.ts
git commit -m "feat: create the CRM order from LiqPay's payment webhook"
```

---

## Task 7: Result page

**Files:**
- Create: `app/checkout/result/page.tsx`
- Create: `components/checkout/result-view.tsx`

**Interfaces:**
- Consumes: `checkStatus` (Task 1), `useCart` (`components/providers`), `useLocale` (`components/providers`)
- Produces: nothing consumed elsewhere — terminal UI

- [ ] **Step 1: Write `components/checkout/result-view.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { spring } from '@/lib/motion'
import { useCart, useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { LogoMark } from '@/components/logo'
import type { LiqPayStatus } from '@/lib/liqpay/types'

export function ResultView({ status }: { status: LiqPayStatus }) {
  const { t } = useLocale()
  const { clear } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if ((status === 'success' || status === 'sandbox') && !cleared.current) {
      cleared.current = true
      clear()
    }
  }, [status, clear])

  const paid = status === 'success' || status === 'sandbox'
  const failed = status === 'failure'

  if (!paid && !failed) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t.checkout.resultPendingTitle}
        </h1>
        <p className="mt-3 text-base text-ink-soft">{t.checkout.resultPendingBody}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring.snap}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-ink"
      >
        {paid ? (
          <Check className="size-7 text-surface" aria-hidden="true" />
        ) : (
          <X className="size-7 text-surface" aria-hidden="true" />
        )}
      </motion.div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {paid ? t.checkout.resultSuccessTitle : t.checkout.resultFailedTitle}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
        {paid ? t.checkout.resultSuccessBody : t.checkout.resultFailedBody}
      </p>
      <PillLink href={paid ? '/shop' : '/checkout'} className="mt-8">
        {paid ? t.cart.continue : t.checkout.backToCart}
      </PillLink>
      {paid && <LogoMark className="mt-16 h-9 w-auto text-ink-faint" />}
    </main>
  )
}
```

- [ ] **Step 2: Write `app/checkout/result/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { checkStatus } from '@/lib/liqpay/client'
import { ResultView } from '@/components/checkout/result-view'

export const metadata: Metadata = {
  title: 'Оформлення',
  robots: { index: false },
}

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string }>
}) {
  const { paymentId } = await searchParams
  const id = paymentId && /^\d+$/.test(paymentId) ? Number(paymentId) : null
  const status = id ? await checkStatus(id) : 'unknown'
  return <ResultView status={status} />
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, then visit `http://localhost:3000/checkout/result?paymentId=123` directly.
Expected: since `LIQPAY_PUBLIC_KEY`/`LIQPAY_PRIVATE_KEY` aren't set yet (Task 8), this throws — that's fine, confirms it reaches `checkStatus()`. Full behavioral check happens in Task 8 once env vars exist.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/result/page.tsx components/checkout/result-view.tsx
git commit -m "feat: add the post-payment result page"
```

---

## Task 8: Env wiring and end-to-end sandbox verification

**Files:**
- Modify: `CLAUDE.md` (env var reference block)
- No other files — this task is configuration + manual verification

- [ ] **Step 1: Add LiqPay env vars to `CLAUDE.md`'s reference block**

In the `## Development Commands` section, extend the `.env.local` reference block:

```bash
WEBSITE_URL=https://plaipich.art  # required — production builds throw without it
HUGEPROFIT_API_KEY=...            # server-only — no NEXT_PUBLIC_ prefix, ever
GOOGLE_CALENDAR_API_KEY=...       # server-only
GOOGLE_CALENDAR_ID=...
LIQPAY_PUBLIC_KEY=...             # server-only — LiqPay sandbox or live public key
LIQPAY_PRIVATE_KEY=...            # server-only — never exposed to the client
LIQPAY_SANDBOX=1                  # "1" routes payments through LiqPay's sandbox
```

Also update the "Open Decisions" section: remove the "Payment provider" bullet (LiqPay is now decided and built) and update `app/api/checkout/` and `lib/hugeprofit/orders.ts` rows in the Architecture tree/table to reflect the paid flow instead of "unpaid; no payment step yet."

- [ ] **Step 2: Get sandbox keys and set local env**

Obtain a LiqPay sandbox `public_key`/`private_key` pair (from the LiqPay merchant dashboard's sandbox mode, or LiqPay's published test keys if using their generic sandbox account) and add to `.env.local`:

```bash
LIQPAY_PUBLIC_KEY=sandbox_...
LIQPAY_PRIVATE_KEY=sandbox_...
LIQPAY_SANDBOX=1
```

- [ ] **Step 3: Expose local dev to the internet for the webhook**

LiqPay's servers need to reach `server_url`, which `localhost` is not. Start a tunnel:

Run: `npx ngrok http 3000` (or any equivalent tunnel tool already available)
Expected: an `https://*.ngrok-free.app` URL. Set `WEBSITE_URL` in `.env.local` to that tunnel URL for the duration of this test (revert afterward — this is a local-only override, never commit a tunnel URL).

- [ ] **Step 4: Run the full flow**

Run: `npm run dev`, add a work to the cart, go through `/checkout`, submit the form.
Expected: browser navigates to a LiqPay-hosted sandbox payment page (`liqpay.ua` domain). This is the first real exercise of `buildCheckoutRequest`'s signature — if the signature is wrong, LiqPay will reject the request outright with a visible error instead of showing a payment form. If that happens, stop and recheck the signature algorithm in `lib/liqpay/client.ts` against LiqPay's current docs before proceeding.

- [ ] **Step 5: Complete a successful sandbox payment**

Use LiqPay's documented sandbox test card/flow to complete payment.
Expected: browser redirects to `/checkout/result?paymentId=...` and shows the success message within a few seconds; the cart badge drops to 0. Check the terminal running `npm run dev` for `[liqpay-callback]` log lines — there should be none (no errors means the webhook ran cleanly). Check the CRM (`crm.h-profit.com`) for a new order with `info.is_paid: true`, `payment_type: "LiqPay"`.

- [ ] **Step 6: Verify a failed payment**

Repeat checkout using LiqPay's documented sandbox decline scenario.
Expected: `/checkout/result` shows the failure message, cart is **not** cleared, and no CRM order is created.

- [ ] **Step 7: Commit the docs update**

```bash
git add CLAUDE.md
git commit -m "docs: record LiqPay as the decided payment provider"
```

---

## Self-Review Notes

- **Spec coverage:** hosted redirect (Task 4–5), webhook-only order creation (Task 6), read-only status page (Task 7), payload-in-URL transport (Task 1–2, 4, 6), env vars (Task 8), sandbox-first verification (Task 8) — all covered. The two noted spec deviations (dropped status API route, leaner payload) are simplifications documented in the plan header.
- **Type consistency checked:** `OrderLine` (Task 3) is used identically in Task 6; `LockedLine`/`CheckoutPayload` (Task 1) flow unchanged through Task 2, 4, 6; `LiqPayStatus` (Task 1) flows unchanged through Task 7.
- **No placeholders:** every step has real code or an exact runnable command with an expected result.

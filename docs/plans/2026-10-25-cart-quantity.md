# Cart Quantity Implementation Plan (P1)

> Work through the tasks in order. Each task ends with a verify step and a commit. Tick `- [ ]` → `- [x]` as you go.

**Goal:** Let a buyer order more than one of a work, up to the CRM's available stock, from the product page and the cart drawer, without weakening the server-side stock check.

**Architecture:** `Product` gains `available` (CRM `instock`, already used for `inStock`). The cart stores any `qty` from 1 to `available`. `/api/checkout` accepts `qty` 1–99 and rejects lines whose fresh `available < qty`. The LiqPay webhook re-checks the same condition before creating the CRM order. One `QtyStepper` component serves the product page and the drawer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, `motion/react` (`m` only), lucide-react.

**Spec:** `task/TASK.md` §4.2, §9. Audit and conflicts: `docs/plans/2026-10-25-client-brief-overview.md` (default A7).

## Global Constraints

- The brief overrides `catalog.md` rule 1 ("availability is boolean") and `cart.md` "qty capped at 1". This plan rewrites those docs.
- The cart is never authoritative: the server re-derives every line from `getFreshProduct()` (uncached). Never trust client `qty` beyond shape validation.
- `net_price` never leaves `lib/hugeprofit/`. `available` is customer-facing stock and is fine to expose.
- Availability is `instock`, never `quantity`. `quantity` ignores reservations (verified 2026-08-13, comment in `lib/hugeprofit/map.ts`).
- Comments: 2–3 lines max, constraints only.
- Verify every task with: `npx react-doctor@latest` → `npm run lint` → `npm run build`.

---

### Task 1: Domain + cart state carry quantity

**Files:**
- Modify: `lib/data.ts` (type `Product`)
- Modify: `lib/hugeprofit/map.ts` (`toProduct`)
- Modify: `components/providers.tsx` (cart types, `add`, new `setQty`, `CART_KEY`)

**Interfaces:**
- Produces: `Product.available: number`. `CartItem = { product: Product; qty: number }`. `useCart().add(product: Product, qty?: number): void` (increments an existing line, clamps to `available`). `useCart().setQty(id: string, qty: number): void` (clamps to 1…`available`).

- [x] **Step 1: Add `available` to `Product`** in `lib/data.ts`, directly above `inStock: boolean`:

```ts
  /** CRM `instock`: units not yet reserved. Caps cart qty; checkout re-checks it fresh. */
  available: number
```

- [x] **Step 2: Map it** in `lib/hugeprofit/map.ts` `toProduct`. Add after the `inStock` line:

```ts
    available: Math.max(0, stock.instock),
```

- [x] **Step 3: Rewrite the cart types and reducers** in `components/providers.tsx`.

Replace the `CartItem` doc comment and type with:

```ts
/** One line per work; `qty` is clamped to the snapshot's `available` (catalog.md rule 1). */
export type CartItem = {
  product: Product
  qty: number
}
```

In `CartContextValue`, replace `add: (product: Product) => void` with:

```ts
  add: (product: Product, qty?: number) => void
  setQty: (id: string, qty: number) => void
```

Replace the `CART_KEY` line and its comment with:

```ts
/* v3: snapshots gained `available`; v2 lines lack it and would clamp to NaN. */
const CART_KEY = 'plai-pich-cart-v3'
```

Add above `export function Providers`:

```ts
function clampQty(qty: number, product: Product): number {
  return Math.max(1, Math.min(Math.floor(qty), product.available))
}
```

Replace the whole `add` callback with:

```ts
  const add = useCallback((product: Product, qty = 1) => {
    // Re-adding refreshes the snapshot and adds to the line, never past stock.
    setItems((prev) =>
      prev.some((i) => i.product.id === product.id)
        ? prev.map((i) =>
            i.product.id === product.id
              ? { product, qty: clampQty(i.qty + qty, product) }
              : i,
          )
        : [...prev, { product, qty: clampQty(qty, product) }],
    )
    setBump((b) => b + 1)
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.product.id === id ? { ...i, qty: clampQty(qty, i.product) } : i)),
    )
  }, [])
```

In the `cartValue` memo, add `setQty,` after `add,` in the returned object, and add `setQty` to the dependency array: `[items, isOpen, bump, add, setQty, remove, clear]`.

- [x] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS. (`checkout-view.tsx` already sends `qty` from the item. `CartItem.qty` widening from `1` to `number` breaks nothing.)

- [x] **Step 5: Commit**

```bash
git add lib/data.ts lib/hugeprofit/map.ts components/providers.tsx
git commit -m "feat(cart): carry CRM available stock and allow qty up to it"
```

---

### Task 2: Server enforces qty ≤ fresh stock (checkout + webhook)

**Files:**
- Modify: `app/api/checkout/route.ts`
- Modify: `app/api/checkout/liqpay-callback/route.ts`
- Modify: `components/checkout/checkout-view.tsx` (handle the new `insufficient` error)
- Modify: `lib/i18n.ts` (`checkout.errorInsufficient`, both locales)

**Interfaces:**
- Consumes: `Product.available`, `useCart().setQty` (Task 1).
- Produces: `POST /api/checkout` → `409 { error: 'insufficient', short: { workId: string; available: number }[] }` when any line asks for more than fresh stock.

- [x] **Step 1: Shape validation** in `app/api/checkout/route.ts`. Add below `const MAX_ITEMS = 20`:

```ts
const MAX_QTY = 99
```

Replace `if (item.qty !== 1) return null` with:

```ts
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_QTY) return null
```

Change the comment `// Duplicate lines would mean qty > 1 by the back door.` to `// Duplicate lines would split one work's qty past the stock check.`

- [x] **Step 2: Fresh-stock check.** Replace the block from `const unavailable: string[] = []` through the `repriced` early return with:

```ts
  const unavailable: string[] = []
  const short: { workId: string; available: number }[] = []
  const repriced: { workId: string; name: string; was: number; now: number }[] = []
  const lines: LockedLine[] = []

  parsed.items.forEach((item, index) => {
    const product = fresh[index]
    if (!product || !product.inStock) {
      unavailable.push(item.workId)
      return
    }
    if (product.available < item.qty) {
      short.push({ workId: item.workId, available: product.available })
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
    lines.push({ productId: product.id, price: product.price, qty: item.qty })
  })

  if (unavailable.length > 0) {
    return NextResponse.json({ error: 'unavailable', unavailable }, { status: 409 })
  }
  if (short.length > 0) {
    return NextResponse.json({ error: 'insufficient', short }, { status: 409 })
  }
  if (repriced.length > 0) {
    return NextResponse.json({ error: 'repriced', repriced }, { status: 409 })
  }
```

(The `payload.length > 1844` guard stays. It fails before payment, so a larger qty string can only cause a safe rejection.)

- [x] **Step 3: Webhook re-check** in `app/api/checkout/liqpay-callback/route.ts`. Replace:

```ts
    const stillAvailable = fresh.every((product) => product?.inStock)
```

with:

```ts
    const stillAvailable = fresh.every(
      (product, index) => !!product && product.available >= locked[index].qty,
    )
```

- [x] **Step 4: i18n.** In `lib/i18n.ts`, add after `errorRepriced` in `uk.checkout`:

```ts
      errorInsufficient: 'Деяких робіт залишилося менше, ніж ви обрали. Ми оновили кількість — перевірте замовлення.',
```

and in `en.checkout`:

```ts
      errorInsufficient: 'Fewer of some works are left than you chose. We updated the quantities — please review your order.',
```

(This is developer-written UI microcopy, like the other checkout errors. List it for owner review in the PR description.)

- [x] **Step 5: Client handling** in `components/checkout/checkout-view.tsx`. Change `const { items, subtotal } = useCart()` to `const { items, subtotal, setQty } = useCart()`. In `handleSubmit`, replace the `if (!res.ok) { ... }` block with:

```ts
      if (!res.ok) {
        if (body?.error === 'insufficient' && Array.isArray(body.short)) {
          for (const line of body.short as { workId: string; available: number }[]) {
            setQty(line.workId, line.available)
          }
        }
        setSubmitError(
          body?.error === 'unavailable'
            ? t.checkout.errorUnavailable
            : body?.error === 'insufficient'
              ? t.checkout.errorInsufficient
              : body?.error === 'repriced'
                ? t.checkout.errorRepriced
                : body?.error === 'payments_disabled'
                  ? t.checkout.errorPaymentsDisabled
                  : t.checkout.errorGeneric,
        )
        setSubmitting(false)
        return
      }
```

- [x] **Step 6: Verify the route with curl.** This needs LiqPay sandbox keys in `.env.local` (without them the route returns 503 before validating). Run `npm run dev`, pick an in-stock work id and its `available` from the dev catalog (warehouse 51630), then:

```bash
curl -s -X POST localhost:3000/api/checkout -H 'Content-Type: application/json' \
  -d '{"items":[{"workId":"<ID>","qty":<AVAILABLE+1>,"price":<PRICE>}],"contact":{"name":"Тест Тест","email":"t@t.ua","phone":"0000000000","city":"Вінниця","address":"1"}}'
```

Expected: `{"error":"insufficient","short":[{"workId":"<ID>","available":<AVAILABLE>}]}`.
Repeat with `qty: <AVAILABLE>`. Expected: 200 with `checkoutUrl`. Repeat with `qty: 0` and `qty: 1.5`. Expected: `{"error":"invalid"}`.

- [x] **Step 7: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add app/api/checkout components/checkout/checkout-view.tsx lib/i18n.ts
git commit -m "feat(checkout): accept qty up to fresh CRM stock, recheck in webhook"
```

---

### Task 3: QtyStepper on the product page and in the cart drawer

**Files:**
- Create: `components/qty-stepper.tsx`
- Modify: `components/shop/product-detail.tsx`
- Modify: `components/cart-drawer.tsx`

**Interfaces:**
- Consumes: `useCart().add(product, qty)`, `useCart().setQty`, `useCart().items`, `Product.available`.
- Produces: `QtyStepper({ value: number; max: number; onChange: (n: number) => void; size?: 'sm' | 'lg' })`.

- [x] **Step 1: Create `components/qty-stepper.tsx`**

```tsx
'use client'

import { Minus, Plus } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { cn } from '@/lib/utils'

export function QtyStepper({
  value,
  max,
  onChange,
  size = 'lg',
}: {
  value: number
  max: number
  onChange: (n: number) => void
  size?: 'sm' | 'lg'
}) {
  const { t } = useLocale()
  const button = cn(
    'inline-flex items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-35',
    size === 'lg' ? 'h-full w-12' : 'h-full w-8',
  )
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-ink/15',
        size === 'lg' ? 'h-[3.25rem]' : 'h-8',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={t.cart.decrease}
        className={button}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className={cn('text-center font-medium text-ink tabular-nums', size === 'lg' ? 'min-w-8 text-base' : 'min-w-6 text-sm')}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t.cart.increase}
        className={button}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
```

(`t.cart.increase` / `t.cart.decrease` already exist in `lib/i18n.ts`.)

- [x] **Step 2: Product page.** In `components/shop/product-detail.tsx`:

Add the import `import { QtyStepper } from '@/components/qty-stepper'`.

Change `const { add, open } = useCart()` to `const { add, open, items } = useCart()` and add below the existing `useState`s:

```tsx
  const [qty, setQty] = useState(1)
  const inCart = items.find((i) => i.product.id === product.id)?.qty ?? 0
  const remaining = Math.max(0, product.available - inCart)
```

Replace `handleAdd` with:

```tsx
  const handleAdd = () => {
    add(product, Math.min(qty, remaining))
    open()
    setQty(1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }
```

Replace `<div className="mt-6">` (the wrapper of the add `PillButton`) and its `PillButton` opening tag with:

```tsx
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* A single unit needs no stepper — the button alone says it. */}
            {product.available > 1 && remaining > 0 && (
              <QtyStepper value={Math.min(qty, remaining)} max={remaining} onChange={setQty} />
            )}
            <PillButton
              size="hero"
              disabled={!product.inStock || remaining === 0}
              onClick={handleAdd}
              className="w-full sm:w-auto"
            >
```

(The button's children and closing tags stay unchanged.)

- [x] **Step 3: Cart drawer.** In `components/cart-drawer.tsx`:

Add `import { QtyStepper } from '@/components/qty-stepper'`. Change `const { items, subtotal, isOpen, close, remove } = useCart()` to also destructure `setQty`. Change `{items.map(({ product }) => (` to `{items.map(({ product, qty }) => (`. Replace the comment `{/* No qty stepper — ... */}` and the `<div className="mt-auto flex items-center justify-end">…</div>` after it with:

```tsx
                        <div className="mt-auto flex items-center justify-between gap-2">
                          {product.available > 1 ? (
                            <QtyStepper
                              size="sm"
                              value={qty}
                              max={product.available}
                              onChange={(n) => setQty(product.id, n)}
                            />
                          ) : (
                            <span />
                          )}
                          <span className="text-sm font-semibold text-ink tabular-nums">
                            {formatPrice(product.price * qty)}
                          </span>
                        </div>
```

- [x] **Step 3b: If P2 shipped first.** Run `grep -n "inCart > 0\|add(product)" components/product-card.tsx`. If it matches, restore P2's full version: `add(product, 1)` and `const full = inCart >= product.available`.

- [ ] **Step 4: Manual check** (`npm run dev`, 375px and 1280px):
  1. A work with `available ≥ 3`: the stepper shows. − is disabled at 1, + is disabled at `available`. Add 2: the drawer opens with qty 2 and line total = 2 × price. The header badge shows 2.
  2. Back on the same page: the stepper max is now `available − 2`. Adding the rest disables the add button.
  3. A work with `available = 1`: no stepper. The «Остання» pill still shows.
  4. Drawer stepper: change qty, the subtotal updates. Reload: qty persists (`plai-pich-cart-v3` in localStorage).
  5. Keyboard: Tab reaches −/+, Space/Enter work, the focus ring is visible. The screen reader announces the value (`aria-live`).

- [x] **Step 5: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/qty-stepper.tsx components/shop/product-detail.tsx components/cart-drawer.tsx
git commit -m "feat(cart): quantity stepper on product page and in cart drawer"
```

---

### Task 4: CRM rehearsal for qty > 1 + docs

**Files:**
- Modify: `.claude/docs/domain/catalog.md` (rule 1)
- Modify: `.claude/docs/domain/cart.md`
- Modify: `.claude/docs/domain/checkout.md` (rule 2, flow step 2)

- [ ] **Step 1: Sandbox rehearsal on the dev warehouse.** Reservation with qty > 1 is **unverified until this passes**. Don't merge to production without it. The whole run is against the CRM's mock `dev` warehouse (51630) so no real work is reserved. The procedure below was proven on 2026-09-07/08.

  1. **Env.** In `.env.local` (gitignored; never commit it), record the current values first so you can restore them, then set:
     ```bash
     CRM_WAREHOUSE_ID=51630          # mock "dev" warehouse — the whole site swings onto it
     LIQPAY_PUBLIC_KEY=sandbox_...   # sandbox pair (already in .env.local since 2026-09-07)
     LIQPAY_PRIVATE_KEY=sandbox_...
     LIQPAY_SANDBOX=1                # createRemoteOrder refuses the real shop (34998) while this is set
     ```
     Run `node scripts/crm-scope.mjs`. Expected: the verdict line shows the token reaches `51630 (dev)`, marked `<-- CRM_WAREHOUSE_ID`. If the token can't read 51630, stop: it was re-scoped to production, so get a dev-capable token from the owners.
  2. **Tunnel.** LiqPay must reach the webhook. **cloudflared does not work on this network** (verified 2026-09-07), so use ngrok:
     ```bash
     npx ngrok config add-authtoken <TOKEN from dashboard.ngrok.com>   # once
     npx ngrok http 3000
     ```
     It prints `https://<random>.ngrok-free.app` (or `.dev`). Set in `.env.local`: `WEBSITE_URL=https://<random>.ngrok-free.app` and `DEV_ORIGIN=<random>.ngrok-free.app` (host only, no scheme). Without `DEV_ORIGIN`, pages over the tunnel never hydrate and "Додати в кошик" does nothing. Restart `npm run dev`.
     Check: `curl -s -o /dev/null -w "%{http_code}\n" https://<random>.ngrok-free.app/shop` → `200`.
  3. **Pick a dev work with `instock ≥ 2`** (all `[DEV]` names):
     ```bash
     curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
       "https://crm.h-profit.com/bapi/products?limit=500&warehouse_id=51630" \
       | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).data.filter(p=>p.stock[0]&&p.stock[0].instock>=2&&p.images.length).map(p=>({id:p.id,name:p.name,instock:p.stock[0].instock})).slice(0,5))})"
     ```
     (`$HUGEPROFIT_API_KEY`: export it from `.env.local` in that shell first.) Note the chosen id and its `instock` (= N).
  4. **Buy qty 2.** Open the tunnel URL in a browser (click through ngrok's one-time "Visit Site" page). Product page → stepper to 2 → add → checkout with any plausible contact details → LiqPay sandbox page → pay with test card `4242 4242 4242 4242`, any future expiry, any CVV. Expected: you return to `/checkout/result?paymentId=…` showing «Дякуємо!» and the cart empties.
  5. **Check the CRM order:**
     ```bash
     curl -s -H "Authorization: $HUGEPROFIT_API_KEY" -H "Content-Type: application/json" \
       "https://crm.h-profit.com/bapi/remote_orders" \
       | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s).response.sort((a,b)=>(a.date_created<b.date_created?1:-1))[0];console.log(JSON.stringify({order_id:o.order_id,price:o.price,info:o.info,line:o.order_data[0]},null,1))})"
     ```
     Expected: `line.quantity` is 2, `line.total` and `price` are 2 × the unit price, `info.is_paid: true`, `is_reserved: true`, `mid: "51630"`. Re-run the step 3 query: the work's `instock` is now N − 2 (`quantity` unchanged).
     If `quantity` is 1, or `instock` dropped by 1, the CRM doesn't honour multi-unit lines as sent. Stop and report before merging. Nothing in P2/P3 depends on the fix, but P1 must not ship.
  6. **Failure path:** in a second browser, add qty N (now more than is available) of the same work and check out. Expected: no LiqPay redirect, and the «Деяких робіт залишилося менше…» error shows with the cart quantity lowered to N − 2.
  7. **Clean up.** Delete the test order in the CRM UI (this releases the reservation). Restore `.env.local` to the values recorded in step 1 (`WEBSITE_URL=http://localhost:3000`, remove `DEV_ORIGIN`, restore `CRM_WAREHOUSE_ID`). Stop ngrok. `git status` must show no `.env*` file.

  Record the result (date, order id, before/after `instock`) as one paragraph in `.claude/docs/domain/checkout.md`.

- [x] **Step 2: Rewrite `catalog.md` rule 1** to:

```md
1. **Availability is a count, capped by the CRM.** `available` = `stock[].instock` (reservations already subtracted); `inStock` = `available > 0`. A buyer may order 1…`available` of a work — client brief 2026-10 (`task/TASK.md` §4.2), replacing the 2026-08-12 boolean rule. Displayed stock is advisory; checkout and the webhook re-check it fresh.

   `isLast` (`instock === 1`) still drives «Остання» on the product page only; cards no longer show it (brief §3.3).
```

Also add `available` to the model block and to the mapping table (`available | stock[].instock | rule 1`).

- [x] **Step 3: Rewrite `cart.md`**: rule 1 → "One line per work; adding a present work adds to its qty, clamped to the snapshot's `available`." Replace the "Tension with the boolean-availability rule" bullet and the "Resolved 2026-08-12" qty bullet with: "**Qty is capped at the snapshot's `available`** (brief 2026-10). The server re-checks against fresh stock and answers `insufficient` with the real counts; the checkout page clamps the cart to them." Change the key note to `plai-pich-cart-v3`.

- [x] **Step 4: Update `checkout.md`**: rule 2 → "Each line's `qty` must be ≤ the work's fresh `available`; shortfalls return `409 insufficient` with per-line counts." Flow step 2 → "Shape-validate; reject qty outside 1–99 (integers), duplicate work ids, >20 items, bad email, blank fields". Add the webhook re-check (`available >= qty`) to the webhook section.

- [x] **Step 5: Commit**

```bash
git add .claude/docs/domain
git commit -m "docs: quantity rule replaces boolean availability (client brief)"
```

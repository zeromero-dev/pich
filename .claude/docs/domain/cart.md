# Cart

The buyer's **draft order** — an intent, not a commitment. Deliberately client-only: no server session, no server-side cart, and nothing in it is trusted by any other context.

## Model (from the code — `components/providers.tsx`)

```
Cart      = CartItem[]           // one item per work, unique by work id
CartItem  = { product: snapshot of Work at add-time, qty ≥ 1 }
derived   : count = Σ qty, subtotalKop = Σ qty × unitPriceKop
```

## Business rules

1. One line per work; adding a present work adds to its qty, clamped to the snapshot's `available`.
2. `1 ≤ qty ≤ available` on every line; removing is explicit (`remove`), not qty 0.
3. Totals are always derived, never persisted — a stored total can't drift from the items.

## Policies

- **Snapshot semantics, accepted staleness.** An item embeds the Work as it looked when added. localStorage (`plai-pich-cart-v3`) outlives catalog cache refreshes, so a restored cart can hold stale prices or already-sold works. Accepted *by design* because of the next policy.
- **Checkout recomputes every line.** The browser sends the displayed price for comparison. Checkout locks the authoritative price and availability from fresh CRM data. See [checkout.md](checkout.md).
- **Qty is capped at the snapshot's `available`** (brief 2026-10). The server re-checks against fresh stock and answers `insufficient` with the real counts; the checkout page clamps the cart to them.
- Restore happens after hydration; SSR renders an empty cart first (accepted flash, not a bug).
- **Nothing is saved before the restore lands** (fixed 2026-11-04). Saving first wrote `[]` over the stored cart, and Strict Mode's re-run read it back — every reload emptied the cart in dev.
- **`clear()` also deletes the stored copy** (fixed 2026-11-05). A child's effect runs before the provider's restore, so the payment result page's clear was undone by the restore and a paid cart survived.

## Use cases

- Add work (this is the purchase-feedback moment — the cart surfaces immediately).
- Remove items, change quantities, or clear the cart. A verified full Mono payment clears it only when the attempt reference and saved cart fingerprint still match this browser's cart.
- Persist and restore the draft across visits.

## Resolved 2026-08-12

- **`CART_KEY` is now `plai-pich-cart-v3`** (2026-10-25). v2 snapshots lack `available` and would clamp to NaN; v1 held mock works. Neither restores.

## Open decisions

None.

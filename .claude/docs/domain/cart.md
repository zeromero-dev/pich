# Cart

The buyer's **draft order** — an intent, not a commitment. Deliberately client-only: no server session, no server-side cart, and nothing in it is trusted by any other context.

## Model (from the code — `components/providers.tsx`)

```
Cart      = CartItem[]           // one item per work, unique by work id
CartItem  = { product: snapshot of Work at add-time, qty ≥ 1 }
derived   : count = Σ qty, subtotal = Σ qty × price   // computed, never stored
```

## Business rules

1. One item per work; adding an already-present work increments its qty.
2. `qty ≥ 1` on every item; setting qty to 0 removes the item.
3. Totals are always derived, never persisted — a stored total can't drift from the items.

## Policies

- **Snapshot semantics, accepted staleness.** An item embeds the Work as it looked when added. localStorage (`plai-pich-cart`) outlives catalog cache refreshes, so a restored cart can hold stale prices or already-sold works. Accepted *by design* because of the next policy.
- **The cart is never authoritative.** No price, availability, or total from the cart crosses into Ordering as truth — Ordering re-derives every line from fresh CRM data server-side ([checkout.md](checkout.md)). Never "fix" staleness by trusting client-sent values; recompute.
- **Tension with the boolean-availability rule**: qty > 1 can't survive Ordering's validation. The draft still allows incrementing qty (v0 behavior) — harmless while checkout is a stub, but it must be capped before checkout goes live.
- Restore happens after hydration; SSR renders an empty cart first (accepted flash, not a bug).

## Use cases

- Add work (this is the purchase-feedback moment — the cart surfaces immediately).
- Remove item / change qty / clear.
- Persist and restore the draft across visits.

## Open decisions

- **Cap qty at 1 and drop the stepper** — decided 2026-08-12 (boolean availability, [catalog.md](catalog.md) rule 1), **not yet implemented**. Do it with the checkout wiring; `add()`/`setQty()` in `components/providers.tsx` and the stepper in `components/cart-drawer.tsx`.
- Cart snapshots taken before 2026-08-12 hold mock works (ids `p1`…`p8`) in the old `Product` shape. They restore and render without error, but they point at works that no longer exist. Bump `CART_KEY` when checkout ships.

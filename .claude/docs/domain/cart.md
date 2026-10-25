# Cart

The buyer's **draft order** — an intent, not a commitment. Deliberately client-only: no server session, no server-side cart, and nothing in it is trusted by any other context.

## Model (from the code — `components/providers.tsx`)

```
Cart      = CartItem[]           // one item per work, unique by work id
CartItem  = { product: snapshot of Work at add-time, qty ≥ 1 }
derived   : count = Σ qty, subtotal = Σ qty × price   // computed, never stored
```

## Business rules

1. One line per work; adding a present work adds to its qty, clamped to the snapshot's `available`.
2. `1 ≤ qty ≤ available` on every line; removing is explicit (`remove`), not qty 0.
3. Totals are always derived, never persisted — a stored total can't drift from the items.

## Policies

- **Snapshot semantics, accepted staleness.** An item embeds the Work as it looked when added. localStorage (`plai-pich-cart`) outlives catalog cache refreshes, so a restored cart can hold stale prices or already-sold works. Accepted *by design* because of the next policy.
- **The cart is never authoritative.** No price, availability, or total from the cart crosses into Ordering as truth — Ordering re-derives every line from fresh CRM data server-side ([checkout.md](checkout.md)). Never "fix" staleness by trusting client-sent values; recompute.
- **Qty is capped at the snapshot's `available`** (brief 2026-10). The server re-checks against fresh stock and answers `insufficient` with the real counts; the checkout page clamps the cart to them.
- Restore happens after hydration; SSR renders an empty cart first (accepted flash, not a bug).

## Use cases

- Add work (this is the purchase-feedback moment — the cart surfaces immediately).
- Remove item / change qty / clear.
- Persist and restore the draft across visits.

## Resolved 2026-08-12

- **`CART_KEY` is now `plai-pich-cart-v3`** (2026-10-25). v2 snapshots lack `available` and would clamp to NaN; v1 held mock works. Neither restores.

## Open decisions

None.

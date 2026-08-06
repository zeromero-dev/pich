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
- **Tension with the one-original rule**: qty > 1 for a unique work can't survive Ordering's validation. The draft currently allows incrementing qty (v0 behavior) — harmless since invalid drafts die at validation, but see open decision.
- Restore happens after hydration; SSR renders an empty cart first (accepted flash, not a bug).

## Use cases

- Add work (this is the purchase-feedback moment — the cart surfaces immediately).
- Remove item / change qty / clear.
- Persist and restore the draft across visits.

## Open decisions

- Cap qty at 1 in the draft and drop the qty stepper once real stock semantics are confirmed? Recommended, deferred until CRM wiring.

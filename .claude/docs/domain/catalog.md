# Catalog

What the shop sells and how buyers find it. Source of truth: HUGEPROFIT CRM. The domain model is ours; the CRM shape is translated at the boundary (`lib/hugeprofit/`, planned) and never leaks past it.

## Model (from the code — `Product`, `Category` in `lib/data.ts`)

```
Work {
  id            identity (CRM product id)
  slug          URL identity — stable, never changes after first publication
  name, description, images
  artist        link to Artists context (today: by display-name string)
  price         UAH, customer price
  category      Category.slug
  inStock       boolean — see rule 1
  medium, size, year   physical attributes of the original
}
Category { slug, label }
```

## Business rules

1. **A work is one physical original.** Availability is boolean (available / sold), never a quantity. An order containing qty ≥ 2 of the same work is invalid by definition — enforced at Ordering's stock validation ([checkout.md](checkout.md)).
2. **Price selection**: customer price is `sale_price` when set and > 0, otherwise `price`.
3. **`net_price` (merchant cost) is not part of the domain.** It arrives in every CRM `stock[]` entry and must be stripped inside `lib/hugeprofit/` before data goes anywhere else. No page prop or API response may carry it — leaking merchant margins is this project's highest-severity bug class.
4. A sold work stays in the catalog, marked "Продано" — a gallery keeps sold pieces on the wall. (Assumption carried from v1 behavior; confirm with owners.)

## Use cases

- **Browse** — whole catalog + category tree for navigation.
- **Search** — the CRM has no search, so it is this app's logic: case-insensitive substring match over `name` + `artist`, composable with a single category filter. Runs over the already-loaded catalog (small, one page) — this design holds after CRM wiring.
- **View work** — lookup by slug; drives per-work SEO metadata.

## Boundary: `lib/hugeprofit/` (planned; today mocked in `lib/data.ts`)

Server-only. Fetches the whole catalog from `GET /bapi/products` (+ `GET /bapi/product_categories`), caches ~5 min (ISR / fetch cache — the cache is also the rate-limit politeness layer). No webhooks exist, so freshness is time-based only; catalog data is advisory by contract and Ordering revalidates at checkout.

CRM → domain mapping (from the API docs; unverified against a live account):

| Domain | CRM | Notes |
|--------|-----|-------|
| `id` | `id` | stringify |
| `slug` | — none | Generate: transliterated name + `-id` suffix. **Proposal — decide before wiring; slugs are permanent.** |
| `artist` | `brand.name` | **Assumption**: CRM `brand` repurposed as artist. Confirm with owners + live data. |
| `price` | `stock[].sale_price` \|\| `stock[].price` | rule 2 |
| `inStock` | `stock[].instock` / `quantity > 0` | exact semantics need live verification |
| `medium`, `size`, `year` | `attr[]` | **Assumption** — attribute names unknown until live data |
| `category` | `categories[]` | tree from `product_categories` |

## Open decisions

- Slug scheme (above).
- Multi-warehouse: which `stock[]` entry is authoritative if the account has several? (Needs `reference_info` from the live account.)

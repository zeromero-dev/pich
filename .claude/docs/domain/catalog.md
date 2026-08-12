# Catalog

What the shop sells and how buyers find it. Source of truth: HUGEPROFIT CRM. The domain model is ours; the CRM shape is translated at the boundary (`lib/hugeprofit/`) and never leaks past it.

**State: built.** Wired to the live CRM 2026-08-12. Everything below is verified against the real account unless tagged otherwise.

## The live account (verified 2026-08-12)

258 products, of which **252 reach the shop** (1 has no price, 5 have no image — rules 2 and 6). One warehouse ("Крамничка ПІЧ", id 34998 — a second warehouse "Події в ПІЧі" (35002) exists and is empty). 71 brands, all Ukrainian personal names. 19 categories, 15 of them in use. This is a **craft shop**, not a gallery of unique originals: 95 works at qty 1, 81 at qty 2–5, 21 at qty 6+, 61 sold out. Prices 20–210 000 ₴, always integers, `sale_price` always equal to `price`. 53 products have no description, 33 have clean copy, 171 hold internal notes (rule 3).

## Model (from the code — `Product`, `Category` in `lib/data.ts`)

```
Work {
  id            identity (CRM product id)
  slug          URL identity — transliterated name + "-{id}"; permanent
  name, images
  artist        Artists context link (display-name string); null for 23 works
  price         UAH, customer price
  category      CRM category id as string; categoryLabel is its Ukrainian name
  inStock       boolean — see rule 1
  size          decoded dimensions, e.g. "30 × 21 см"; null when unset
  sku           CRM article; null when blank
}
Category { slug (CRM category id), label }
```

**Deliberately absent from the model** — so no page or response can carry them:

- `medium`, `year` — no source. `attr[]` is populated on 2 of 258 products and `af` on none. (The cleaner descriptions do carry technique and year as prose — "Акрил, полотно. м.Вінниця. 2022 р.")
- `net_price` — rule 4.

## Business rules

1. **Availability is boolean** (available / sold), never a quantity — decided 2026-08-12. The CRM does carry real quantities and 102 works have more than one in stock, so this is a deliberate simplification: a buyer cannot order two of the same candle. Revisit if the owners report lost sales.

   The one quantity fact that does reach the UI is `isLast` (`quantity === 1`), shown as «Остання» — 92 works today. Scarcity is real information for a buyer; it does not reopen the rule, since one-left and many-left both mean "available".
2. **Price selection**: customer price is `sale_price` when set and > 0, otherwise `price`. A work with no positive price is dropped from the catalog entirely.
3. **The CRM `description` field renders verbatim, and the CRM is where it gets cleaned.** Decided 2026-08-12 by the owners' side, reversing an earlier decision to suppress it.

   Know what this means before touching it. As of 2026-08-12, **171 of 258 descriptions hold the owners' internal notes**: artists' bank card numbers and IBANs, tax ids (ІПН/ЄДРПОУ), legal names ("ФОП …", "за паспортом …"), phone numbers, cost prices ("собівартість"), and pasted private chat messages. Only 33 are clean product copy. The site renders whatever is in the field, so **every one of those publishes until an owner edits it in the CRM.** Editing there is the fix; do not add a sanitiser and call it solved — pattern-matching this reliably is not achievable, and a filter that mostly works reads as safety it cannot deliver.

   Consequences to respect: the text is **not** put into `<meta description>` or JSON-LD (`app/shop/[slug]/page.tsx`), to keep it out of search indexes while cleanup happens. Cost prices in descriptions also route around rule 4 — the structural guarantee covers the `net_price` field, not prose.
4. **`net_price` (merchant cost) is not part of the domain.** It arrives in every CRM `stock[]` entry and dies inside `lib/hugeprofit/map.ts`. Leaking merchant margins is this project's highest-severity bug class after rule 3.
5. **Sold works stay in the catalog**, marked "Продано", sorted after available ones (`getCatalog()`). 61 of 258 today.
6. **A work with no image is not sellable** and is dropped from the catalog entirely — decided 2026-08-12. Its product page 404s too (`getProductBySlug`). 5 works today. Adding a photo in the CRM brings one back within the cache window.

## Use cases

- **Browse** — whole catalog, category filters with counts, sort (newest / price ascending / price descending), and an "лише в наявності" toggle. Sold works stay last under every sort — they are not offers.
- **Search** — the CRM has no search endpoint, so it is this app's logic: case-insensitive substring match over `name` + `artist` + **every category label in the work's chain**, composable with the filters above, over the already-loaded catalog. Confirmed viable: 252 products is one page.
- **View work** — lookup by slug; drives per-work SEO metadata.

### Category filtering follows the tree

The CRM returns a work's leaf category *plus its ancestors*, and `Product.categories` keeps that whole chain. A filter matches if the selected id appears anywhere in it, so «Хенд мейд» finds the 81 works filed under its children (Кераміка, Свічки, Іграшки) as well as the 5 filed on it directly. Filter counts are computed the same way, which is why parent and child pills legitimately overlap. Getting this wrong is not subtle: the flat version showed 5 of 86.

## Boundary: `lib/hugeprofit/`

Server-only (`import 'server-only'` — a client import is a build error). `client.ts` holds the authed fetch, `map.ts` the CRM→domain translation, `index.ts` the public API. Catalog fetch is `GET /bapi/products?limit=500&warehouse_id=34998`, cached 300s (`cache: 'force-cache'` + `next.revalidate` — Next 16 makes caching opt-in and needs `force-cache` explicitly for requests carrying an `Authorization` header). No webhooks exist, so freshness is time-based only; catalog data is advisory by contract and Ordering revalidates at checkout via `getFreshProduct()`.

CRM → domain mapping (verified against live data):

| Domain | CRM | Notes |
|--------|-----|-------|
| `id` | `id` | stringify |
| `slug` | — none | `toSlug()`: transliterated name + `-{id}`. The id is not decoration: names repeat ("Чокер" ×3) and the owners rename products. |
| `artist` | `brand.name` | **Confirmed**: all 71 brands are personal names. `brand` is `{}` on 23 products → `null`. |
| `price` | `stock[].sale_price` \|\| `stock[].price` | rule 2 |
| `inStock` | `stock[].quantity > 0` | `instock` and `quantity` are identical on all 258 rows |
| `categories` | `category[]` | the whole chain, leaf first — see category filtering above |
| `artistId`, `artistSlug` | `brand.id`, `brand.name` | the Artists join ([artists.md](artists.md)) |
| `isLast` | `stock[].quantity === 1` | rule 1 |
| `size` | `size` | packed as `"AxBxC"` with blanks for unset (`"30xx21x"` → 30 × 21, `"xxx"` → none). Unit is **centimetres**, confirmed 2026-08-12. 195 of 258 have no dimensions at all. |
| `description` | `description` | verbatim, trimmed; rule 3 |
| `images` | `images` | full CRM-hosted URLs; all of them render (main image + thumbnails, up to 8) |
| `sku` | `sku` | blank on 11 products → `null`. **Not displayed** — a CRM-generated code like `b6c-a43` means nothing to a buyer. Kept on the model because `order_data[]` needs it. |

Category filters are derived from the loaded products, not from `GET /bapi/product_categories`: that endpoint lists 19 categories of which 4 hold nothing, and its parent/child tree is inconsistently filled (roots are `0` in most rows, `null` in two).

## Known API facts

- `product_id` accepts **one** id — a comma-separated list returns `{"success": false, "error": "unhandled_error"}`.
- `warehouse_id` filters the product list correctly but is **ignored by `count=1`** (which returned 258 for the empty warehouse too).
- Product images are public: `https://crm.h-profit.com/bimages/get/...` serves without the `Authorization` header, so the browser can load them directly.
- `type_product` is 1 (simple) on 256 products and 2 (variation) on 2 — the two "Чокер" colour variants, which we render as two independent works.

## Open decisions

- Do the three `size` slots mean width × height × depth? The unit is settled (cm); the axis order is not, and the owners fill different slots for the same kind of object.
- 23 works have no artist and 6 have no image — leave as-is, or ask the owners to fill them in?
- The two `type_product: 2` variants appear as two separate works with the same name. Acceptable, or group them?

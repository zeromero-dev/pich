# Product Card, Product Page & Artist Page Implementation Plan (P2)

> Work through the tasks in order. Each task ends with a verify step and a commit. Tick `- [ ]` → `- [x]` as you go.

**Goal:** Add-to-cart on product cards (hover on mouse devices, always-visible on touch), no «Остання» badge on cards, an «Автор:» link on the product page, and a portrait + bio header on artist pages with works kept below.

**Architecture:** `ProductCard` splits into an image area (decorative link + overlay button) and a text link, so the button is never nested inside a link. Touch vs. mouse uses Tailwind 4's `pointer-fine:` variant (present in `node_modules/tailwindcss`), not JS. The artist header switches to two columns only when `artistProfiles` has a portrait, so today's pages (no profiles) render as before.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, `motion/react` (`m` only), lucide-react.

**Spec:** `task/TASK.md` §3.1, §3.3, §4.1, §5. Decisions: `docs/plans/2026-10-25-client-brief-overview.md` (default A6). §3.2 (photo crop) and §5 video are **not** in this plan, see overview §3.

## Global Constraints

- **Runs with or without P1.** First check: `grep -n "available: number" lib/data.ts`. Found → P1 has shipped, use the code as written. Not found → in Task 1 Step 2 use `add(product)` instead of `add(product, 1)` and `const full = inCart > 0` instead of `inCart >= product.available` (the pre-P1 cart holds one of each work). When P1 lands later, its executor restores those two lines (P1 Task 3 Step 3b).
- No interactive element inside another (`<button>` never inside `<a>`).
- Removing the «Остання» badge is visual only. `isLast`/`available` and stock logic stay untouched.
- Do not commit invented artist bios or portraits. `artistProfiles` stays `{}` unless the owners supply content.
- Verify every task with: `npx react-doctor@latest` → `npm run lint` → `npm run build`, plus checks at 375/768/1280px.

---

### Task 1: Product card: add-to-cart button, no «Остання»

**Files:**
- Modify: `components/product-card.tsx` (full rewrite below)
- Modify: `lib/i18n.ts` (`shop.inCart`, both locales)

**Interfaces:**
- Consumes: `useCart().add(product, 1)`, `useCart().items`, `Product.available` (P1).
- Produces: `ProductCard({ product })`, same props as today, so every call site (shop grid, related works, artist page, homepage) gets the button.

- [ ] **Step 1: i18n.** In `lib/i18n.ts` add after `shop.addToCart` → uk: `inCart: 'У кошику',` en: `inCart: 'In cart',`.

- [ ] **Step 2: Rewrite `components/product-card.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { m, useReducedMotion } from 'motion/react'
import { Check, Plus } from 'lucide-react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import type { Product } from '@/lib/data'

/* Touch devices have no hover: there the button is an always-visible round "+".
   `pointer-fine:` turns it into the full-width bar revealed on hover/focus. */
function AddToCart({ product }: { product: Product }) {
  const { t } = useLocale()
  const { add, items } = useCart()
  const [added, setAdded] = useState(false)
  const inCart = items.find((i) => i.product.id === product.id)?.qty ?? 0
  const full = inCart >= product.available

  const handleAdd = () => {
    add(product, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const done = added || full
  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={full}
      aria-label={`${full ? t.shop.inCart : t.shop.addToCart}: ${product.name}`}
      className="absolute right-2 bottom-2 z-10 inline-flex size-10 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-surface shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-[opacity,background-color] hover:bg-[#2a2a2a] disabled:cursor-default pointer-fine:inset-x-3 pointer-fine:bottom-3 pointer-fine:h-11 pointer-fine:w-auto pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
    >
      {done ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      <span className="hidden pointer-fine:inline">
        {full ? t.shop.inCart : t.shop.addToCart}
      </span>
    </button>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const { t } = useLocale()
  const reduced = useReducedMotion()
  const href = `/shop/${product.slug}`

  return (
    <m.article
      whileHover={reduced ? undefined : { y: -4 }}
      transition={spring.settle}
      className="group relative"
    >
      <m.div
        whileHover={reduced ? undefined : { boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
        transition={spring.settle}
        className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt"
      >
        {/* Duplicate of the title link for pointer users; hidden from AT and Tab. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          <m.div
            className="absolute inset-0"
            whileHover={reduced ? undefined : { scale: 1.03 }}
            transition={spring.settle}
          >
            <img
              src={product.images[0] || '/placeholder.svg'}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain p-3"
            />
          </m.div>
        </Link>
        {product.inStock ? (
          <AddToCart product={product} />
        ) : (
          <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-surface">
            {t.shop.soldOut}
          </span>
        )}
      </m.div>
      <Link href={href} className="mt-3 block">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-ink text-pretty">
          {product.name}
        </h3>
        <p className="mt-0.5 text-sm text-ink-soft">{product.artist}</p>
        <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
          {formatPrice(product.price)}
        </p>
      </Link>
    </m.article>
  )
}
```

(The image `alt` moves to `""` because the image link is hidden from assistive tech. The title link carries the name.)

- [ ] **Step 3: Manual check** (`npm run dev`, `/shop`):
  1. 1280px with a mouse: the button is invisible until the card is hovered. Clicking it adds 1, the header badge pops, the icon shows ✓ for 1.5s, and the drawer stays closed. Clicking the image or title opens the product.
  2. Keyboard: Tab goes title link → button (the button becomes visible on focus) → next card. No stop on the image.
  3. DevTools device mode (375px, touch): the round "+" is always visible at the bottom-right of the image. Tapping it adds to cart without navigating.
  4. Add a work until `inCart = available`: the button shows ✓ «У кошику» and is disabled.
  5. A sold work: «Продано» badge, no button. No card anywhere shows «Остання».
  6. Reduced motion on: no lift or zoom, the button still works.

- [ ] **Step 4: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/product-card.tsx lib/i18n.ts
git commit -m "feat(shop): add-to-cart on product cards, drop «Остання» card badge"
```

---

### Task 2: «Автор:» link on the product page

**Files:**
- Modify: `components/shop/product-detail.tsx` (artist block at the top of the info column)
- Modify: `lib/i18n.ts` (`shop.author`, both locales)

- [ ] **Step 1: i18n.** Add to `shop`: uk `author: 'Автор:',` en `author: 'Author:',`.

- [ ] **Step 2: Replace the artist block.** In `components/shop/product-detail.tsx`, replace the whole `{product.artist && (product.artistSlug ? ( <Link …/> ) : ( <p …/> ))}` expression with:

```tsx
          {product.artist && (
            <p className="text-sm text-ink-soft">
              {t.shop.author}{' '}
              {product.artistSlug ? (
                <Link
                  href={`/artists/${product.artistSlug}`}
                  className="font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink"
                >
                  {product.artist}
                </Link>
              ) : (
                <span className="text-ink">{product.artist}</span>
              )}
            </p>
          )}
```

- [ ] **Step 3: Manual check:** a product with an artist shows «Автор: <underlined name>», and the link goes to `/artists/<slug>`. A product without an artist (22 live works) shows no line. The EN locale shows "Author:".

- [ ] **Step 4: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/shop/product-detail.tsx lib/i18n.ts
git commit -m "feat(shop): «Автор:» label and underlined artist link on product page"
```

---

### Task 3: Artist page header: portrait + bio (image9), works below

**Files:**
- Modify: `components/artists/artist-detail.tsx` (the `<Reveal>` header block)

- [ ] **Step 1: Replace the header `<Reveal className="mt-6 mb-10 max-w-[65ch]">…</Reveal>`** with:

```tsx
      <Reveal
        className={
          artist.portrait
            ? 'mt-6 mb-12 grid items-start gap-8 md:grid-cols-2 md:gap-12'
            : 'mt-6 mb-10 max-w-[65ch]'
        }
      >
        {artist.portrait && (
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface-alt">
            <img
              src={artist.portrait}
              alt={artist.name}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <div className="max-w-[65ch] md:pt-2">
          <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-5xl">
            {artist.name}
          </h1>
          <p className="mt-2 text-sm text-ink-faint tabular-nums">
            {t.about.worksCount(artist.workCount)}
          </p>
          {/* Bios are repo content and most artists have none yet — see artists.md. */}
          {artist.bio && (
            <p className="mt-6 text-base leading-relaxed whitespace-pre-line text-ink-soft text-pretty">
              {artist.bio}
            </p>
          )}
        </div>
      </Reveal>
```

The works grid below stays exactly as it is (brief §5: "keep the artist's products below their profile").

- [ ] **Step 2: Manual check with a throwaway profile (do not commit).** Temporarily add to `artistProfiles` in `lib/data.ts`: `'<a real slug from /artists>': { portrait: '/images/template.jpg', bio: 'Тест.\n\nДругий абзац.' }`. At 1280px: square photo left, name/count/bio right, works below. At 375px: photo stacked above the text. Remove the entry and confirm `git diff lib/data.ts` is empty. An artist without a profile looks exactly as before.

- [ ] **Step 3: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/artists/artist-detail.tsx
git commit -m "feat(artists): portrait + bio header when a profile exists"
```

- [ ] **Step 4: Docs.** In `.claude/docs/domain/catalog.md` rule 1, note that cards no longer show «Остання» (P1 Task 4 already wrote it; confirm). In `.claude/docs/ui-ux-guidelines.md` §5 add: "Product card: add-to-cart button. Mouse = full-width bar revealed on hover/focus; touch = always-visible round '+' (`pointer-fine:` variant). Adds 1, does not open the drawer." Commit:

```bash
git add .claude/docs
git commit -m "docs: product card add-to-cart behaviour"
```

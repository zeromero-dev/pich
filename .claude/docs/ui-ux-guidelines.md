# Plai Pich — UI/UX Guidelines (v1)

Design direction, tokens, motion rules, and page blueprints for the first version of the site. Written to be **implemented directly in code** (Tailwind 4 + Motion) — token values here are the source of truth until a real design system replaces them.

**Direction in one paragraph:** premium-minimal like an Apple product page. Strictly white + black — no accent color. The interface is a monochrome frame; the art and product photography are the *only* color on every page, which makes them impossible to miss. Hierarchy comes from type size/weight and space, not from color. The *feel* comes from motion — quick, springy, tactile micro-interactions in the spirit of the Nintendo Switch UI: everything responds instantly, nothing floats slowly.

**Logo:** exists but is not in the repo yet. Add it to `public/` before building the header. If the logo itself is colored, it stays the single colored UI element — don't let its color leak into buttons or links.

---

## 1. Color tokens

Monochrome only. Defined for Tailwind 4's `@theme` in `app/globals.css`:

```css
@theme {
  --color-surface: #ffffff;        /* page background */
  --color-surface-alt: #f7f7f7;    /* alternating sections, card backdrops, skeletons */
  --color-ink: #111111;            /* primary text, primary buttons */
  --color-ink-soft: #555555;       /* secondary text */
  --color-ink-faint: #a3a3a3;      /* placeholders, disabled */
  --color-hairline: #11111114;    /* borders — 8% ink, never solid gray lines */
}
```

**Usage rules**

- White (`surface`) is the default everywhere; `surface-alt` only to separate full-width sections and as the backdrop inside product-image frames.
- Black is the accent. The primary CTA is white-on-`ink` — on an otherwise airy white page a solid black pill is the loudest element without any color.
- Everything readable is `ink` or `ink-soft` (both pass AA on white with room to spare). `ink-faint` is for non-essential text only.
- Emphasis without color: bigger, bolder, more space — never a hue. Links in body text: underlined `ink`, no link color.
- The only color on any page comes from photography (artwork, the space) and, if colored, the logo. Guard this — one stray colored badge breaks the whole scheme.
- Exception — semantic states: form errors use Tailwind's `red-600`, success confirmations `green-700`. Function over purity; don't gray those out.
- Exception — funder marks: the UCORD / Swiss Confederation / NIRAS logos in the footer keep their brand colors (donor visibility). Footer only; they never travel up the page.

## 2. Typography

The template ships Geist (via `next/font`). It fits the SaaS-clean direction, **but the site is Ukrainian-first and I don't know whether the bundled Geist version covers Cyrillic — verify before committing to it.** If it doesn't: use **Inter** (full Cyrillic, closest same feel) for everything. Do not mix Latin-in-Geist with Cyrillic-in-fallback — one font for all locales.

Scale (rem, mobile → desktop where they differ):

| Token | Size | Weight | Notes |
|-------|------|--------|-------|
| `display` | 2.5rem → 4.5rem | 600 | Landing hero only. Tracking `-0.03em`, line-height 1.05 |
| `h1` | 2rem → 3rem | 600 | Page titles. Tracking `-0.02em` |
| `h2` | 1.5rem → 2rem | 600 | Section titles |
| `h3` | 1.125rem | 600 | Card titles, product names |
| `body` | 1rem | 400 | Line-height 1.6 |
| `small` | 0.875rem | 400/500 | Meta, captions, prices in cards |
| `price` | 1.25rem | 600 | Product page price — tabular numerals (`font-variant-numeric: tabular-nums`) |

Apple-like rules: few sizes, big jumps between them, negative tracking on large text only, never on body. Max text-block width `65ch`.

## 3. Space, shape, elevation

- **Spacing**: Tailwind's default 4px scale. Sections: `py-16` mobile / `py-24` desktop. Card internal padding `p-4`–`p-6`. When in doubt, add more space — density is the enemy of this direction.
- **Container**: `max-w-6xl mx-auto px-4 md:px-6`.
- **Radius**: soft, Switch-like. Cards & images `rounded-2xl` (16px), modals/drawers `rounded-3xl`, buttons & inputs `rounded-full` (pills), tiny elements (badges) `rounded-full`. Nothing square-cornered.
- **Elevation**: hairline borders (`--color-hairline`) for resting cards; shadow appears only on interaction or floating elements. Shadows are soft and neutral, e.g. `0 8px 30px rgba(0,0,0,0.08)`. Never harsh drop shadows.

## 4. Motion — the personality layer

**Library: [Motion](https://motion.dev)** (`npm i motion` — the successor of framer-motion; React 19 compatible). This is the one animation dependency; no GSAP, no AOS, no Lottie in v1. Components import `m` from `motion/react`, never `motion`: `components/providers.tsx` wraps the tree in `LazyMotion features={domMax} strict`, which keeps ~30 kB out of the bundle and throws on a stray `motion.` element.

The target feel is *tactile and instant* — Nintendo Switch, not luxury-brand slow-fade. Concretely:

**Timing & easing tokens**

| Token | Value | Use |
|-------|-------|-----|
| `snap` | spring `{ stiffness: 500, damping: 30 }` | press feedback, toggles, cart badge |
| `settle` | spring `{ stiffness: 300, damping: 28 }` | cards entering, drawers, hover lifts |
| `fade` | 200ms `ease-out` | opacity-only changes, tooltips |
| `page` | 350ms `[0.22, 1, 0.36, 1]` (easeOutQuint-ish) | page/section entrances |

**Standard patterns (use these, don't improvise per-component)**

- **Press**: every clickable scales to `0.97` while pressed (`whileTap`), spring `snap` back. This single rule delivers most of the Switch feel.
- **Hover on cards**: lift `y: -4` + shadow appears + image inside scales to `1.03` (image only, overflow hidden). Spring `settle`.
- **Entrance**: content blocks fade in + rise 12px, triggered on scroll into viewport (`whileInView`, `once: true`). Grids stagger children by 50ms — a wave, not a popcorn.
- **Cart feedback**: on add-to-cart, the header cart badge pops (scale 1 → 1.3 → 1, spring `snap`) and increments. This is the primary purchase-feedback moment — make it satisfying.
- **Drawer/modal**: cart drawer slides from right, spring `settle`, backdrop fades. Mobile: slides from bottom.
- **Loading**: skeleton blocks with a slow shimmer while CRM data streams in — never spinners for content, spinners only inside buttons during submit.
- **Hero**: the hero photo may scale very slowly (1.0 → 1.05 over 20s+, subtle Ken Burns). The only slow animation allowed on the site.

**Hard rules**

- Animate `transform` and `opacity` only. Never `width`/`height`/`top` — no layout-triggering animation.
- Everything interactive responds within one frame; animation follows input, never delays it.
- `prefers-reduced-motion`: entrances become plain fades, presses/pops/drift are disabled, drawers appear without sliding. Wire this from day one (Motion's `useReducedMotion`), not as a retrofit.
- Reserve image space with `aspect-ratio` before load — zero layout shift, ever.

## 5. Core components

- **Header**: sticky, `bg-white/80` + `backdrop-blur`, hairline bottom border appears after scrolling. Contains: logo, nav (Крамничка / Події / Про нас / Митці), locale switch (УКР/EN, pill toggle), cart button with count badge. Mobile: logo + cart + hamburger opening a full-screen menu (staggered link entrance).
- **Buttons**: pill-shaped. Primary — white on `ink`, hover `#2a2a2a`; Secondary — `ink` text, hairline border, transparent bg; Ghost — `ink-soft` text only. Heights: 44px (default) / 52px (hero CTA). All get the press-scale.
- **Product card**: image frame with fixed `aspect-[4/5]`, `surface-alt` backdrop, `object-contain` — paintings keep their true proportions, and contain-on-a-uniform-backdrop unifies the inconsistent CRM photos better than crop-to-cover. Below: name (`h3`, max 2 lines), price (`small`, 600 weight, "₴1 200" format, space as thousands separator). Whole card is the link.
- **Event card**: date block on the left (day number large, month small — like a calendar leaf), title, time + location line, "Записатись" ghost button. Sourced from Google Calendar.
- **Search**: input in the shop toolbar (not the header, in v1), pill-shaped, expands slightly on focus. Client-side filtering over the already-fetched catalog — results update as you type (debounce ~150ms), grid animates re-order. Empty state: friendly, offers to clear filters.
- **Inputs (checkout)**: pill/rounded fields, labels above (never placeholder-as-label), 2px `ink` focus ring. Validate on blur, re-validate on change after first error ("reward early, punish late").
- **Footer**: `surface-alt`, generous, address + hours + socials + mini-nav. The place where the art-center-as-a-place identity shows.

## 6. Page blueprints (v1)

**Landing** — the sales pitch for the place:
1. Hero: `display` statement in black on white, one strong photo of the space/art, primary CTA → shop, secondary → events.
2. "Найближчі події" — next 3 events as cards, link to full calendar.
3. Featured works — 6–8 product cards, link to shop.
4. About teaser — short text + photo, link to about/artist.
5. Footer.

**Shop (Крамничка)**: toolbar (search + category chips from CRM categories, horizontally scrollable on mobile) → product grid `2 / 3 / 4` columns (mobile / tablet / desktop). Product page: image gallery left (all CRM images, thumbnails), right column: name, price, description, add-to-cart, stock hint ("В наявності" — advisory, per CLAUDE.md gotcha). Cart is a drawer, not a page. Checkout: single page, one column, cart summary + contact + delivery fields, payment step (stub in v1 — provider TBD).

**Events (Події)**: list grouped by month, event cards, each expandable or linking to a detail view with description + "add to my calendar" link. A month-grid calendar view is **v2** — list-first ships v1.

**Artist / About (Митці / Про нас)**: portrait, bio (content lives in the repo), selected works linking into the shop. Layout is a simple editorial column — `65ch` text, full-bleed images between sections.

## 7. Accessibility & i18n baseline

- AA contrast everywhere (see color rules); `focus-visible` ring in `ink`, 2px offset, on every interactive element (on the black button, the offset gap is what makes the ring visible).
- Touch targets ≥ 44px; the press animation is feedback, not a substitute for target size.
- `<html lang>` follows locale (uk default / en); all UI strings from locale dictionaries; product/event content renders in whatever language the CRM/Calendar has (per CLAUDE.md — don't promise translated catalog).
- Product image `alt` = product name from CRM; decorative images get empty `alt`.
- Currency: `₴` with space-separated thousands; dates in Ukrainian format for uk locale ("14 серпня, 18:00").

## 8. Open items

- Logo file → `public/` (if it's colored, it stays the only colored UI element — see top note).
- Verify Geist Cyrillic coverage (§2) — decide Geist vs Inter before building any page.
- Real photography of the space for the landing hero — the design leans on one great photo; a `surface-alt` placeholder block works until then. (2026-09-06: one temporary interior photo, `public/images/template.jpg`, stands in everywhere — 853px wide, so it is upscaled on desktop.) In a monochrome UI the photos do all the emotional work, so photo quality matters more here than in most designs.
- Payment step UI depends on provider choice (LiqPay/monobank/Fondy/WayForPay) — design the checkout so the payment block is a swappable section.

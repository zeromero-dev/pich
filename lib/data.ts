/**
 * Domain types. Works and artists come from the CRM via `lib/hugeprofit/`;
 * events come from Notion (`lib/events.ts`). Catalog content is
 * single-language (as the CRM provides it); events and artists have
 * optional EN columns — see i18n.md.
 */

export type Category = {
  /** CRM category id as a string — stable, unlike the Ukrainian label. */
  slug: string
  label: string
}

/** A category as shown in the shop filter bar. */
export type CategoryFilter = Category & {
  /** Works in this category *including its descendants* — see catalog.md. */
  count: number
}

/** A homepage category tile: a root category with a cover from its newest work. */
export type CategoryTile = CategoryFilter & {
  cover: string
}

/**
 * A work in the shop. No `medium`/`year` — the CRM has no source for them
 * (`attr[]` is filled on 2 of 258 products).
 */
export type Product = {
  id: string
  slug: string
  name: string
  /** `null` when the CRM brand is unset — 22 of the 252 live works today. */
  artist: string | null
  /** Notion «Імʼя (EN)» for the EN locale; `artist` is shown when absent. */
  artistEn?: string
  /** CRM brand id — the stable half of the Artists join. */
  artistId: string | null
  /** URL segment of the artist page (the brand id); null when there is no page to link to. */
  artistSlug: string | null
  price: number
  /**
   * Leaf category first, then its ancestors. Filtering matches anywhere in
   * this chain, so picking a parent finds works filed under its children.
   */
  categories: Category[]
  /** CRM `instock`: units not yet reserved. Caps cart qty; checkout re-checks it fresh. */
  available: number
  inStock: boolean
  /** Exactly one left. Drives the "остання" marker; product page only. */
  isLast: boolean
  images: string[]
  /**
   * CRM description, rendered verbatim. Decided 2026-08-12: the owners clean
   * the field in the CRM — see catalog.md rule 3 for what is in there today.
   */
  description: string | null
  /** Decoded from the CRM `size` field, e.g. "30 × 21 см". */
  size: string | null
  /** CRM article. Not displayed — it is an internal code — but orders need it. */
  sku: string | null
}

/**
 * An artist, derived from the CRM brand on their works, or a «Митці» row added by
 * hand. Photo and bio come from Notion — see `lib/artists.ts`.
 */
export type Artist = {
  /** CRM brand id, or the Notion «ID» ("ar-7") of a row with no CRM brand. */
  id: string
  /** URL segment, /artists/<slug>. Equal to `id`: addresses are IDs only. */
  slug: string
  name: string
  /** «Імʼя (EN)» for the EN locale; `name` is shown when absent. */
  nameEn?: string
  workCount: number
  /** First image of one of their works, used as the roster thumbnail. */
  cover: string | null
  portrait?: string
  bio?: string
  /** English bio for the EN locale; `bio` is shown when absent. */
  bioEn?: string
  /** From the Notion «Митці» columns of the same names; http(s) only. */
  instagram?: string
  website?: string
}


import type { Product } from '@/lib/data'
import { slugBase } from '@/lib/slug'
import type { CrmProduct, CrmStock } from './types'

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Slugs are permanent URLs, so they carry the CRM id: names repeat in this
 * catalog ("Чокер" ×3) and the owners rename products in the CRM.
 */
export function toSlug(name: string, id: number): string {
  const base = slugBase(name)
  return base ? `${base}-${id}` : String(id)
}

/**
 * Artist slugs stay bare (no id) — they are the prettier URL and CRM brand
 * names are distinct today. The id is appended only if a name would collide.
 */
export function toArtistSlug(name: string, brandId: number | undefined): string {
  const base = slugBase(name)
  if (base) return base
  return brandId ? `artist-${brandId}` : 'artist'
}

export function idFromSlug(slug: string): number | null {
  const id = Number(slug.split('-').pop())
  return Number.isInteger(id) && id > 0 ? id : null
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * CRM `size` packs up to three dimensions between literal "x" separators, with
 * blanks for unset ("30xx21x" → 30 × 21, "xxx" → nothing). Unit assumed cm.
 */
export function toSize(raw: string | null | undefined): string | null {
  if (!raw) return null
  const parts = raw.split('x').filter((part) => part.trim() !== '')
  return parts.length ? `${parts.join(' × ')} см` : null
}

const SHOW_FIELD = 'Показувати на сайті'
// Typed by hand in the CRM: case, whitespace and trailing dots are stripped first.
const YES = new Set(['так', 'т', 'tak', 'да', 'yes', 'y', 'true', '1', '+', '✓', '✔', '✅'])
const NO = new Set(['ні', 'нi', 'hі', 'hi', 'н', 'ni', 'ne', 'нет', 'no', 'n', 'false', '0', '-', '✗', '✘', '❌'])

/** Opt-in: only a known yes publishes a work. Unset, no or a typo all hide it. */
export function isShownOnSite(af: CrmProduct['af']): boolean {
  const raw = af?.[SHOW_FIELD]
  if (raw == null || raw.trim() === '') return false
  const value = raw.trim().toLowerCase().replace(/[.!\s]+$/, '')
  if (YES.has(value)) return true
  if (!NO.has(value)) console.warn(`[crm] unrecognised "${SHOW_FIELD}": ${JSON.stringify(raw)}`)
  return false
}

/** The one stock row that matters. Every product in this account has exactly one. */
function stockFor(product: CrmProduct, warehouseId: number): CrmStock | undefined {
  return product.stock.find((s) => s.mid === warehouseId) ?? product.stock[0]
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * CRM product → domain Work. This function is the boundary: `net_price` has no
 * home in the return type, so no page or API response can carry it.
 */
export function toProduct(crm: CrmProduct, warehouseId: number): Product | null {
  if (!isShownOnSite(crm.af)) return null
  const stock = stockFor(crm, warehouseId)
  if (!stock) return null

  const price = stock.sale_price > 0 ? stock.sale_price : stock.price
  if (price <= 0) return null

  const artist = crm.brand?.name?.trim() || null

  return {
    id: String(crm.id),
    slug: toSlug(crm.name, crm.id),
    name: crm.name.trim(),
    artist,
    artistId: crm.brand?.id ? String(crm.brand.id) : null,
    artistSlug: artist ? toArtistSlug(artist, crm.brand?.id) : null,
    price,
    // The CRM returns the leaf plus its ancestors, which is what makes a
    // parent-category filter able to find works filed under its children.
    categories: crm.category.map((c) => ({ slug: String(c.id), label: c.name })),
    // `instock` is availability, `quantity` is physical stock on hand — they
    // diverge once an order reserves a unit (verified live 2026-08-13: one
    // reservation took instock 29 → 28 while quantity stayed 29). Reading
    // `quantity` here would re-offer works that are already spoken for.
    inStock: stock.instock > 0,
    available: Math.max(0, stock.instock),
    isLast: stock.instock === 1,
    images: crm.images,
    description: crm.description?.trim() || null,
    size: toSize(crm.size),
    sku: crm.sku || null,
  }
}

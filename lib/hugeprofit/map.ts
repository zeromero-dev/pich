import type { Product } from '@/lib/data'
import type { CrmCategory, CrmProduct, CrmStock } from './types'

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The product URL is the bare CRM id (/shop/9054735), so renames can't break it.
 * Until 2026-11-01 it was name + id (/shop/chashka-9054735); the id is still the
 * last segment, so those links resolve and redirect.
 */
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
    slug: String(crm.id),
    name: crm.name.trim(),
    artist,
    artistId: crm.brand?.id ? String(crm.brand.id) : null,
    // The artist's URL is the bare CRM brand id: a rename can't break it.
    artistSlug: artist && crm.brand?.id ? String(crm.brand.id) : null,
    price,
    // The CRM returns the leaf plus its ancestors, which is what makes a
    // parent-category filter able to find works filed under its children.
    categories: crm.category
      .filter((c): c is CrmCategory & { id: number; name: string } => c.id !== null && !!c.name)
      .map((c) => ({ slug: String(c.id), label: c.name })),
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

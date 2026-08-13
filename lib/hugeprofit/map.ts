import type { Product } from '@/lib/data'
import type { CrmProduct, CrmStock } from './types'

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'y', э: 'e',
  ё: 'e', '’': '', "'": '', ʼ: '',
}

function transliterate(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
}

/**
 * Slugs are permanent URLs, so they carry the CRM id: names repeat in this
 * catalog ("Чокер" ×3) and the owners rename products in the CRM.
 */
function slugBase(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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
    isLast: stock.instock === 1,
    images: crm.images,
    description: crm.description?.trim() || null,
    size: toSize(crm.size),
    sku: crm.sku || null,
  }
}

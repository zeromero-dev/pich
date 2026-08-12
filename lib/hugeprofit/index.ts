import 'server-only'

import type { Artist, CategoryFilter, Product } from '@/lib/data'
import { crmFetch, SHOP_WAREHOUSE_ID } from './client'
import { idFromSlug, toProduct } from './map'
import type { CrmProduct, CrmProductsResponse } from './types'

export { CrmError } from './client'

/** `limit` default is 500; the catalog is 258 rows, so one page covers it. */
const PAGE_LIMIT = 500

async function fetchCrmProducts(
  params: Record<string, string | number> = {},
  revalidate?: number,
): Promise<CrmProduct[]> {
  const body = await crmFetch<CrmProductsResponse>(
    'products',
    { limit: PAGE_LIMIT, warehouse_id: SHOP_WAREHOUSE_ID, ...params },
    revalidate,
  )
  return body.data ?? []
}

/** A work with no photograph has nothing to sell — decided 2026-08-12. */
function isSellable(product: Product | null): product is Product {
  return product !== null && product.images.length > 0
}

/**
 * The whole shop, sold works last (they stay on the wall — catalog.md rule 5).
 * CRM order is newest-first and preserved within each group.
 */
export async function getCatalog(): Promise<Product[]> {
  const crm = await fetchCrmProducts()
  const products = crm.map((p) => toProduct(p, SHOP_WAREHOUSE_ID)).filter(isSellable)

  return [
    ...products.filter((p) => p.inStock),
    ...products.filter((p) => !p.inStock),
  ]
}

/**
 * Filter categories, derived from the catalog rather than
 * `GET /product_categories` — that endpoint lists 19 categories of which only
 * 15 hold products, and its parent/child tree is inconsistently filled in.
 *
 * A work counts towards every category in its chain, so "Хенд мейд" reports
 * all 86 of its works rather than only the 5 filed directly on it.
 */
export function categoriesOf(products: Product[]): CategoryFilter[] {
  const counts = new Map<string, CategoryFilter>()
  for (const product of products) {
    for (const category of product.categories) {
      const entry = counts.get(category.slug)
      if (entry) entry.count += 1
      else counts.set(category.slug, { ...category, count: 1 })
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'uk'),
  )
}

/**
 * The roster, built from the CRM brands on the works themselves — every artist
 * with something in the shop, most works first. Bios are repo content and are
 * layered on in the Artists pages; an artist without one still gets a page.
 */
export function artistsOf(products: Product[]): Artist[] {
  const bySlug = new Map<string, Artist>()
  for (const product of products) {
    if (!product.artist || !product.artistSlug) continue
    const entry = bySlug.get(product.artistSlug)
    if (entry) {
      entry.workCount += 1
      entry.cover ??= product.images[0] ?? null
    } else {
      bySlug.set(product.artistSlug, {
        id: product.artistId ?? product.artistSlug,
        slug: product.artistSlug,
        name: product.artist,
        workCount: 1,
        cover: product.images[0] ?? null,
      })
    }
  }
  return [...bySlug.values()].sort(
    (a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, 'uk'),
  )
}

export function worksByArtistSlug(products: Product[], slug: string): Product[] {
  return products.filter((p) => p.artistSlug === slug)
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const id = idFromSlug(slug)
  if (id === null) return undefined

  const crm = await fetchCrmProducts({ product_id: id })
  const product = crm[0] ? toProduct(crm[0], SHOP_WAREHOUSE_ID) : null
  if (!isSellable(product)) return undefined
  // Guard against a stale slug pointing at a renamed product.
  return product.slug === slug ? product : undefined
}


/**
 * Checkout-time truth: bypasses the catalog cache. `product_id` takes a single
 * id only (a comma list returns `unhandled_error`), so this is one call per line.
 */
export async function getFreshProduct(id: string): Promise<Product | null> {
  const crm = await fetchCrmProducts({ product_id: id }, 0)
  return crm[0] ? toProduct(crm[0], SHOP_WAREHOUSE_ID) : null
}

/**
 * Raw HUGEPROFIT CRM shapes, field names verbatim. Nothing outside
 * `lib/hugeprofit/` may import these — `net_price` enters here and dies here.
 * Verified against the live account 2026-08-12.
 */

export type CrmStock = {
  id: number
  /** Warehouse id. The docs call this `marketplace_id` on write endpoints. */
  mid: number
  name: string
  instock: number
  quantity: number
  /** Merchant cost price. Must never cross into the domain — see catalog.md. */
  net_price: number
  price: number
  sale_price: number
  sku?: string
}

export type CrmCategory = {
  id: number
  name: string
  /** Roots are 0 in most rows and null in a few — treat both as "no parent". */
  parent_id: number | null
}

/** `{}` for the 23 products with no brand set; `name` may also be null. */
export type CrmBrand = {
  id?: number
  name?: string | null
}

export type CrmAttr = {
  name: string
  value: string
  id: string
}

export type CrmProduct = {
  id: number
  name: string
  brand: CrmBrand
  /** Leaf first, then ancestors. Empty for none (unused in this account). */
  category: CrmCategory[]
  attr: CrmAttr[]
  af: unknown
  /**
   * Internal notes in this account — 167 of 258 rows hold artists' card
   * numbers, legal names and phone numbers. Never mapped, never rendered.
   */
  description: string | null
  images: string[]
  /** Encoded dimensions, `"AxBxC"` with blanks for unset; `"xxx"` = none. */
  size: string
  unit: string
  sku: string
  barcode: string | null
  stock: CrmStock[]
  /** 1 = simple, 2 = variation (2 rows in this account). */
  type_product: number
  parent_id?: number
}

export type CrmProductsResponse = {
  success: boolean
  data: CrmProduct[]
}

export type CrmCountResponse = {
  total: number
}

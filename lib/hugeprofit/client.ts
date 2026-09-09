import 'server-only'

/**
 * Thin authed wrapper over the HUGEPROFIT REST API. Server-only: importing this
 * from a client component is a build error, which is the point.
 */

const BASE = 'https://crm.h-profit.com/bapi'

/** Catalog cache window. Also our rate-limit politeness layer — limits are undocumented. */
export const CATALOG_REVALIDATE = 300

function requiredWarehouseId(name: string): number {
  const raw = process.env[name]
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      `${name} must be a positive integer warehouse id — got ${raw === undefined ? 'unset' : JSON.stringify(raw)}. ` +
        'It anchors the dev-only CRM guards, so it is never defaulted; set it in .env.local and in the Vercel project settings.',
    )
  }
  return id
}

/**
 * "Крамничка ПІЧ" — the only warehouse real works are sold from, and the anchor
 * every dev-only gate compares against. Never defaulted: a lost anchor would
 * flip `DEV_ONLY` on and let a sandbox write reach the real shop.
 */
export const REAL_SHOP_WAREHOUSE_ID = requiredWarehouseId('CRM_SHOP_WAREHOUSE_ID')

/**
 * The account also has "Події в ПІЧі" (35002) and the mock "dev" warehouse
 * (51630); `CRM_WAREHOUSE_ID` swings the whole site onto one of those for
 * payment testing. Never set it in production.
 */
const configuredWarehouse = Number(process.env.CRM_WAREHOUSE_ID)
export const SHOP_WAREHOUSE_ID =
  Number.isInteger(configuredWarehouse) && configuredWarehouse > 0
    ? configuredWarehouse
    : REAL_SHOP_WAREHOUSE_ID

// A deployed production site pointed at a test warehouse would serve mock works
// as the real shop. `VERCEL_ENV`, not `NODE_ENV` — a local production build is
// how the rehearsal typechecks, and that must keep working.
if (process.env.VERCEL_ENV === 'production' && process.env.CRM_WAREHOUSE_ID) {
  throw new Error(
    'CRM_WAREHOUSE_ID must not be set in production — it points the shop at a test warehouse. Remove it from the Vercel project settings.',
  )
}

/**
 * Test mode: the catalog points somewhere other than the real shop, so every
 * CRM request must stay inside that warehouse. Enforced below, in both
 * directions — no read may name the real shop, no write may leave it standing.
 */
export const DEV_ONLY = SHOP_WAREHOUSE_ID !== REAL_SHOP_WAREHOUSE_ID

export class CrmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CrmError'
  }
}

function token(): string {
  const value = process.env.HUGEPROFIT_API_KEY
  if (!value) {
    throw new CrmError('HUGEPROFIT_API_KEY is not set — add it to .env.local')
  }
  return value
}

export async function crmFetch<T>(
  path: string,
  params: Record<string, string | number> = {},
  revalidate: number | 0 = CATALOG_REVALIDATE,
): Promise<T> {
  // In test mode an unscoped read is as dangerous as a wrong one: `products`
  // without `warehouse_id` returns the real catalogue alongside the mock rows.
  if (DEV_ONLY) {
    const requested = params.warehouse_id
    if (requested === undefined) {
      throw new CrmError(
        `refusing an unscoped CRM read (${path}) — dev-only mode requires warehouse_id ${SHOP_WAREHOUSE_ID}`,
      )
    }
    if (Number(requested) !== SHOP_WAREHOUSE_ID) {
      throw new CrmError(
        `refusing a CRM read (${path}) for warehouse ${requested} — dev-only mode allows ${SHOP_WAREHOUSE_ID} only`,
      )
    }
  }

  const url = new URL(`${BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const res = await fetch(url, {
    headers: {
      Authorization: token(),
      'Content-Type': 'application/json',
    },
    // Caching is opt-in in Next 16, and requests carrying an Authorization
    // header need force-cache explicitly (see docs/functions/fetch).
    cache: revalidate === 0 ? 'no-store' : 'force-cache',
    ...(revalidate === 0 ? {} : { next: { revalidate } }),
  })

  if (!res.ok) {
    throw new CrmError(`CRM ${path} responded ${res.status}`, res.status)
  }

  const body = (await res.json()) as T & { success?: boolean; error?: string }
  if (body.success === false) {
    throw new CrmError(`CRM ${path} failed: ${body.error ?? 'unknown error'}`)
  }
  return body
}

/** Writes are never cached and never retried — a retry could double-create an order. */
export async function crmPost<T>(path: string, payload: unknown): Promise<T> {
  // Catch-all for every write path, present and future: sandbox money must
  // never move real stock. `createRemoteOrder` carries its own narrower guard.
  if (process.env.LIQPAY_SANDBOX === '1' && !DEV_ONLY) {
    throw new CrmError(
      `refusing a CRM write (${path}) against the real shop while LIQPAY_SANDBOX=1 — set CRM_WAREHOUSE_ID to a test warehouse`,
    )
  }

  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: token(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) {
    throw new CrmError(`CRM ${path} responded ${res.status}: ${text.slice(0, 200)}`, res.status)
  }

  let body: T & { success?: boolean; error?: string }
  try {
    body = JSON.parse(text)
  } catch {
    throw new CrmError(`CRM ${path} returned non-JSON: ${text.slice(0, 200)}`)
  }
  if (body.success === false) {
    throw new CrmError(`CRM ${path} failed: ${body.error ?? 'unknown error'}`)
  }
  return body
}

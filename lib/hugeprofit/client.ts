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
        'It is never defaulted; set it in .env.local and in the Vercel project settings.',
    )
  }
  return id
}

/**
 * The warehouse the whole site sells from — "Крамничка ПІЧ" (34998) in
 * production, the mock "dev" warehouse (51630) in Preview and locally. Never
 * defaulted: a missing value would silently sell from whatever a default named.
 */
export const SHOP_WAREHOUSE_ID = requiredWarehouseId('CRM_WAREHOUSE_ID')

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
  // Every read stays inside the configured warehouse: `products` without
  // `warehouse_id` returns every warehouse the token can reach.
  if (Number(params.warehouse_id) !== SHOP_WAREHOUSE_ID) {
    throw new CrmError(
      `refusing a CRM read (${path}) for warehouse ${params.warehouse_id ?? 'none'} — only ${SHOP_WAREHOUSE_ID} is allowed`,
    )
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
  // Sandbox money must never create orders on the production deployment, whose
  // warehouse holds real works. Every write passes here, so this covers them all.
  if (process.env.LIQPAY_SANDBOX === '1' && process.env.VERCEL_ENV === 'production') {
    throw new CrmError(`refusing a CRM write (${path}) — LIQPAY_SANDBOX=1 on the production deployment`)
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

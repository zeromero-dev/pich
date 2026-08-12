import 'server-only'

/**
 * Thin authed wrapper over the HUGEPROFIT REST API. Server-only: importing this
 * from a client component is a build error, which is the point.
 */

const BASE = 'https://crm.h-profit.com/bapi'

/** Catalog cache window. Also our rate-limit politeness layer — limits are undocumented. */
export const CATALOG_REVALIDATE = 300

/**
 * "Крамничка ПІЧ". The account also has "Події в ПІЧі" (35002), empty today;
 * filtering keeps non-shop stock out of the catalog if it ever gets used.
 */
export const SHOP_WAREHOUSE_ID = 34998

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

import 'server-only'

import { NextResponse } from 'next/server'

/**
 * Lookup results are the same for every visitor, so the CDN caches them —
 * success only, which is why `npCall` itself stays uncached. This is also our
 * only brake on these public proxy routes; NP's rate limits are undocumented.
 */
export async function lookupResponse<T>(load: () => Promise<T[]>): Promise<NextResponse> {
  try {
    const options = await load()
    return NextResponse.json(options, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    })
  } catch (error) {
    console.error('[nova-poshta] lookup failed', error)
    return NextResponse.json({ error: 'unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}

export function badLookup(): NextResponse {
  return NextResponse.json({ error: 'invalid' }, { status: 400 })
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRef(value: string | null): value is string {
  return !!value && GUID.test(value)
}

/** Search text, trimmed and capped; `null` when absent or over-long. */
export function queryParam(params: URLSearchParams, max = 50): string | null {
  const q = (params.get('q') ?? '').trim()
  return q.length <= max ? q : null
}

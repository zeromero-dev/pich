import 'server-only'

/**
 * Nova Poshta API 2.0 — one JSON-RPC-style POST endpoint. The address lookups
 * we use answer without a key (verified live 2026-10-29 and 2026-11-05), so none
 * is sent. That is undocumented: if NP starts refusing, add `apiKey` to the body.
 */

const ENDPOINT = 'https://api.novaposhta.ua/v2.0/json/'

export class NovaPoshtaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NovaPoshtaError'
  }
}

type NpResponse<T> = {
  success: boolean
  data: T[]
  errors: string[]
}

/**
 * Uncached on purpose: NP reports failures as HTTP 200 + `success: false`, which
 * the fetch cache would keep. Lookups are cached at the CDN instead, success only
 * (`lib/nova-poshta/http.ts`); checkout validation must read fresh anyway.
 */
export async function npCall<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string>,
): Promise<T[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelName,
      calledMethod,
      methodProperties,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) throw new NovaPoshtaError(`${modelName}.${calledMethod} responded ${res.status}`)

  const body = (await res.json()) as NpResponse<T>
  if (!body.success) {
    throw new NovaPoshtaError(`${modelName}.${calledMethod} failed: ${body.errors.join('; ') || 'unknown error'}`)
  }
  return body.data
}

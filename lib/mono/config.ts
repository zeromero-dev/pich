import { MAX_TOTAL_KOP } from '@/lib/mono/money'

export function boundedInteger(raw: string | undefined, max: number, fallback: number | null): number | null {
  if (raw === undefined) return fallback
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null
}

export function invoiceLimitKop(raw: string | undefined, vercelEnv: string | undefined): number | null {
  return boundedInteger(raw, MAX_TOTAL_KOP, vercelEnv === 'production' ? null : MAX_TOTAL_KOP)
}

import { timingSafeEqual } from 'node:crypto'
import { formatKop } from '@/lib/format'
import { orderHealth, type CrmRemoteOrder } from '@/lib/hugeprofit/order-rules'
import { toKop } from '@/lib/mono/money'

/**
 * Pure rules for the daily reconciliation report (spec "Zero deliveries are possible").
 * It must stand on its own: Vercel Hobby keeps runtime logs for one hour.
 */

export function keyMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const DAY = 86_400
const MAX_SPAN = 31 * DAY // mono: "'to'-'from' cannot be more than 31 days" (2026-11-18)
const DATE = /^\d{4}-\d{2}-\d{2}$/

function dayStart(value: string): number | null {
  if (!DATE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms / 1000
}

/** Default: the last 7 days. `to` is inclusive (through the end of that UTC day). */
export function reportWindow(from: string | null, to: string | null, now: Date): { fromUnix: number; toUnix: number } | null {
  const nowUnix = Math.floor(now.getTime() / 1000)
  if (!from && !to) return { fromUnix: nowUnix - 7 * DAY, toUnix: nowUnix }
  const fromUnix = from ? dayStart(from) : null
  const toStart = to ? dayStart(to) : null
  if (fromUnix === null || (to && toStart === null)) return null
  const toUnix = toStart === null ? nowUnix : Math.min(toStart + DAY, nowUnix)
  return fromUnix < toUnix && toUnix - fromUnix <= MAX_SPAN ? { fromUnix, toUnix } : null
}

export type Finding = { invoiceId: string; reference: string; amountKop: number; problem: string }

type Item = { invoiceId: string; status: string; amount: number; reference?: string; cancelList?: unknown[] }
type Current = { status: string; finalAmount?: number; cancelList?: unknown[] } | null

/** `ours` is already filtered to our integration; `current` is the invoice's live status, read only when needed. */
export function findingsFor(item: Item, ours: CrmRemoteOrder[], current: Current, warehouseId: string): Finding[] {
  const finding = (problem: string): Finding => ({
    invoiceId: item.invoiceId,
    reference: item.reference ?? '',
    amountKop: item.amount,
    problem,
  })
  const status = current?.status ?? item.status
  if (ours.length === 0) return item.status === 'success' && status === 'success' ? [finding('paid, no CRM order')] : []
  if (ours.length > 1) return [finding('several CRM orders')]

  const order = ours[0]
  const sale = order.sales_id !== null ? ' (converted to sale)' : ''
  const problems: string[] = []
  if (toKop(order.price) !== item.amount) problems.push('total differs')
  problems.push(...orderHealth(order, warehouseId))
  const cancels = current?.cancelList ?? item.cancelList ?? []
  if (status === 'reversed') problems.push(`full reversal${sale}`)
  else if (current?.finalAmount !== undefined && current.finalAmount < item.amount) problems.push(`partial refund${sale}`)
  else if (cancels.length > 0) problems.push(`pending cancellation${sale}`)
  return problems.map(finding)
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ')

export function renderReport(window: { fromUnix: number; toUnix: number }, checked: number, findings: Finding[]): string {
  const head = `Звірка оплат plata by mono: ${iso(window.fromUnix)} — ${iso(window.toUnix)} (UTC). Перевірено: ${checked}.`
  if (findings.length === 0) return `${head}\n\nВсе гаразд.`
  const lines = findings.map((f) => `${f.problem} — інвойс ${f.invoiceId}, ref ${f.reference}, ${formatKop(f.amountKop)}`)
  return `${head}\n\nПотребує уваги (${findings.length}):\n${lines.join('\n')}`
}

/**
 * Kopeck money rules (spec "Money"). The only float→kopeck conversion is
 * `toKop`, the only kopeck→decimal one is `fromKop`; floats are never summed.
 */

// ponytail: placeholder (₴1 000 000) until the acquiring terminal limit is confirmed — cutover plan.
export const MAX_TOTAL_KOP = 100_000_000

/** Exact for CRM prices: four decimals, ≤15 significant digits (spec Money rule 1). */
function exactKop(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const kop = Math.round(value * 100)
  return kop / 100 === value && Number.isSafeInteger(kop) ? kop : null
}

export function toKop(hryvnias: unknown): number | null {
  const kop = exactKop(hryvnias)
  return kop !== null && kop <= MAX_TOTAL_KOP ? kop : null
}

export function fromKop(kop: number): number {
  return kop / 100
}

const isPositiveInt = (n: number) => Number.isSafeInteger(n) && n > 0

export function totalKop(lines: readonly { unitPriceKop: number; qty: number }[]): number | null {
  if (lines.length === 0) return null
  let sum = 0
  for (const { unitPriceKop, qty } of lines) {
    if (!isPositiveInt(unitPriceKop) || !isPositiveInt(qty)) return null
    const line = unitPriceKop * qty
    if (!Number.isSafeInteger(line)) return null
    sum += line
    if (!Number.isSafeInteger(sum) || sum > MAX_TOTAL_KOP) return null
  }
  return sum
}

const LOCALIZED = /^(\d{1,3}(?:[  ]\d{3})*|\d+)(?:,(\d{1,2}))?\s*грн$/

/** Report-only decoder: HugeProfit documents line totals as `500,32 грн`; a JSON number is also accepted. */
export function parseCrmLineTotal(value: unknown): number | null {
  if (typeof value === 'number') return exactKop(value)
  if (typeof value !== 'string') return null
  const match = LOCALIZED.exec(value.trim())
  if (!match) return null
  const whole = Number(match[1].replace(/[  ]/g, ''))
  const kop = whole * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(kop) && kop > 0 ? kop : null
}

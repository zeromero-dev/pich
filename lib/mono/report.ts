import { createHash, timingSafeEqual } from 'node:crypto'
import { formatKop } from '@/lib/format'
import { invoiceIdFromOrderNote, orderHealth, paymentMismatch, type CrmRemoteOrder } from '@/lib/hugeprofit/order-rules'
import { toKop } from '@/lib/mono/money'
import { sameInvoice, SITE_REFERENCE, siteInvoiceDestination } from '@/lib/mono/rules'
import type { InvoiceStatus } from '@/lib/mono/types'

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
  // Date.parse rolls 2026-02-30 into March: only a date that round-trips is real.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value ? null : ms / 1000
}

type ReportWindow = { fromUnix: number; toUnix: number }

/** Default: the last 7 days. `to` is inclusive (through the end of that UTC day). */
export function reportWindow(from: string | null, to: string | null, now: Date, defaultDays = 7): ReportWindow | null {
  const nowUnix = Math.floor(now.getTime() / 1000)
  if (!from && !to) return { fromUnix: nowUnix - defaultDays * DAY, toUnix: nowUnix }
  const fromUnix = from ? dayStart(from) : null
  const toStart = to ? dayStart(to) : null
  if (fromUnix === null || (to && toStart === null)) return null
  const toUnix = toStart === null ? nowUnix : Math.min(toStart + DAY, nowUnix)
  return fromUnix < toUnix && toUnix - fromUnix <= MAX_SPAN ? { fromUnix, toUnix } : null
}

export function reportStatementId(sortedInvoiceIds: string[]): string {
  return createHash('sha256').update(JSON.stringify(sortedInvoiceIds)).digest('base64url')
}

export function reportContinuation(window: ReportWindow, statementId: string, after: string): string {
  return `${window.fromUnix}.${window.toUnix}.${statementId}.${Buffer.from(after).toString('base64url')}`
}

export function parseReportContinuation(value: string, now: Date): { window: ReportWindow; statementId: string; after: string } | null {
  const match = /^(\d{1,12})\.(\d{1,12})\.([\w-]{43})\.([\w-]*)$/.exec(value)
  if (!match) return null
  const fromUnix = Number(match[1])
  const toUnix = Number(match[2])
  if (fromUnix >= toUnix || toUnix - fromUnix > MAX_SPAN || toUnix > Math.floor(now.getTime() / 1000)) return null
  const after = Buffer.from(match[4], 'base64url').toString('utf8')
  if (Buffer.from(after).toString('base64url') !== match[4]) return null
  return { window: { fromUnix, toUnix }, statementId: match[3], after }
}

const SALE = ' (замовлення вже переведено в продаж)'
const MISMATCH = 'замовлення в CRM не позначене як оплата цього інвойсу'
const OUTSIDE = 'оплата не з сайту (без номера замовлення)'
const UNKNOWN_SOURCE = 'не підтверджено, що оплата з сайту'
const UNCHECKED = 'не вдалося перевірити — відкрийте звірку ще раз пізніше'

export type Finding = { invoiceId: string; reference: string; amountKop: number; problem: string; refund?: { chargedKop: number; remainingKop: number } }

type Item = Pick<InvoiceStatus, 'invoiceId' | 'status' | 'amount' | 'ccy' | 'reference' | 'cancelList' | 'destination'>

export function siteOrderReference(item: Item): string | undefined {
  const ref = item.reference
  return ref && SITE_REFERENCE.test(ref) && item.destination === siteInvoiceDestination(ref) ? ref : undefined
}

export function uncheckedFinding(item: Item): Finding {
  return { invoiceId: item.invoiceId, reference: siteOrderReference(item) ?? '', amountKop: item.amount, problem: UNCHECKED }
}

/** `ours` is already filtered to our integration; `current` is the invoice's live status, read only when needed. */
export function findingsFor(item: Item, ours: CrmRemoteOrder[], current: InvoiceStatus | null, warehouseId: string): Finding[] {
  const reference = siteOrderReference(item)
  const finding = (problem: string, amountKop = item.amount): Finding => ({
    invoiceId: item.invoiceId,
    reference: reference ?? '',
    amountKop,
    problem,
  })
  if (!reference) return [finding(!item.destination && SITE_REFERENCE.test(item.reference ?? '') ? UNKNOWN_SOURCE : OUTSIDE)]
  if (current && !sameInvoice(current, item)) return [uncheckedFinding(item)]
  const status = current?.status ?? item.status
  const remaining = status === 'reversed' ? 0 : status === 'success' ? current?.finalAmount ?? item.amount : item.amount
  if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > item.amount) return [uncheckedFinding(item)]
  const refunded = remaining < item.amount
  const withBalance = (problem: string, amountKop = item.amount): Finding => ({
    ...finding(problem, amountKop),
    ...(refunded ? { refund: { chargedKop: item.amount, remainingKop: remaining } } : {}),
  })
  const statementCancels = item.cancelList ?? []
  const liveCancels = current?.cancelList
  const cancellations = (liveCancels ?? statementCancels).map((entry) => (entry as { status?: unknown } | null)?.status)
  if (status !== 'reversed' && statementCancels.length > 0 && liveCancels?.length === 0) return [uncheckedFinding(item)]
  if (item.status === 'success' && status !== 'success' && status !== 'reversed') return [uncheckedFinding(item)]
  // A status-less statement entry may still be in progress.
  const pending = cancellations.some((state) => state !== 'failure' && state !== 'success')
  const sale = ours.length === 1 && ours[0].sales_id != null ? SALE : ''
  if (pending && remaining > 0) return [withBalance(`повернення коштів в обробці${sale}`)]
  if (status === 'success' && current?.finalAmount === undefined && cancellations.includes('success')) return [uncheckedFinding(item)]
  if (ours.length === 0) {
    return status === 'success' && remaining > 0 ? [withBalance('оплачено, але замовлення в CRM немає', remaining)] : []
  }
  if (ours.length > 1) return [withBalance('кілька замовлень у CRM на одну оплату')]
  const order = ours[0]
  // A sale may lose payment marks (cutover Task 7), but a note naming a different invoice is a conflict.
  const notedInvoiceId = invoiceIdFromOrderNote(order.info?.order_text)
  const mismatch = sale ? notedInvoiceId !== undefined && notedInvoiceId !== item.invoiceId : paymentMismatch(order, item.invoiceId)
  if (refunded && mismatch) return [withBalance(MISMATCH)]
  if (remaining === 0) return [withBalance(`кошти повернуто повністю${sale}`)]
  if (status !== 'success') return [uncheckedFinding(item)]
  if (refunded && sale) return [withBalance(`кошти повернуто частково${sale}`)]

  const problems: string[] = mismatch ? [MISMATCH] : []
  if (toKop(order.price) !== remaining) problems.push('сума в CRM не збігається з оплатою')
  problems.push(...orderHealth(order, warehouseId))
  if (refunded) problems.push(`кошти повернуто частково${sale}`)
  return problems.map((problem) => withBalance(problem))
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ')

const FIX_ORDER = 'Перевірте платіж у mono й виправте замовлення в HugeProfit відповідно до товарів, які покупець отримає, та суми, яка залишилась після повернень.'
const DEVELOPER = 'Повідомте розробнику: сайт не зміг прочитати це замовлення з CRM. Саме замовлення не чіпайте.'
const ONCE = ' Зробіть це один раз. Рядок повторюватиметься, доки оплата входить у період звірки.'
const IN_PROGRESS =
  'Поки нічого не робіть: повернення ще обробляється, зазвичай наступного дня рядок зміниться на повне або часткове повернення. Якщо не змінюється понад день — перевірте платіж у кабінеті mono.'

/* Keyed by the exact problem text (findingsFor, orderHealth). A finding repeats daily while it stays in the
   7-day window, so a one-off action says so (ONCE). */
const ACTIONS: Record<string, string> = {
  [MISMATCH]:
    'Звірте інвойс у mono із замовленням у HugeProfit. Підтвердьте, що інвойс належить цьому замовленню, перш ніж змінювати статус оплати, резерв чи саме замовлення. Якщо зв’язок не вдається підтвердити, повідомте розробнику.',
  'оплачено, але замовлення в CRM немає':
    'Поверніть кошти лише після перевірки. У кабінеті mono (web.monobank.ua) знайдіть інвойс і звірте суму, яка залишилась до повернення. Якщо замовлення створили в HugeProfit вручну — кошти НЕ повертайте. Інакше поверніть лише залишок. Після повного повернення цей рядок зникне.',
  [OUTSIDE]:
    'Це оплата не через сайт: наприклад, за посиланням, створеним вручну в кабінеті mono. Якщо ви про неї знаєте — нічого не робіть. Якщо ні — перевірте платіж у кабінеті mono.',
  [UNKNOWN_SOURCE]:
    'Перевірте, звідки надійшла оплата, у кабінеті mono. Поки не підтвердите походження платежу, не повертайте кошти й не змінюйте замовлення.',
  'кілька замовлень у CRM на одну оплату':
    'Звірте платіж у mono та замовлення в HugeProfit за цим номером. З’ясуйте, яке замовлення відповідає оплаті, перш ніж змінювати резерви чи видаляти дублікати.',
  'сума в CRM не збігається з оплатою': FIX_ORDER,
  'сума замовлення не збігається із сумою рядків': FIX_ORDER,
  'не вдається прочитати суми рядків': DEVELOPER,
  'товар не зарезервовано':
    'Зарезервуйте в HugeProfit на складі магазину товари, які ще має отримати покупець.',
  'товар зарезервовано не на тому складі':
    'Перенесіть резерв цього замовлення в HugeProfit на склад магазину.',
  'кошти повернуто повністю':
    'Покупцю вже повернули гроші. Скасуйте замовлення в HugeProfit, щоб звільнити резерв.' + ONCE,
  [`кошти повернуто повністю${SALE}`]:
    'Покупцю вже повернули гроші. Звірте інвойс mono з продажем у HugeProfit. Після підтвердження оформіть повернення саме цього продажу, щоб товар повернувся на склад.' + ONCE,
  'кошти повернуто частково':
    'Звірте всі часткові повернення в mono з товарами, які вже прибрали з замовлення. Внесіть у HugeProfit лише нові зміни, щоб сума дорівнювала залишку в цьому рядку.',
  [`кошти повернуто частково${SALE}`]:
    'Звірте інвойс mono з продажем у HugeProfit, а потім звірте часткові повернення в обох системах. Оформіть повернення лише тих товарів, які ще не повернули в обліку.',
  'повернення коштів в обробці': IN_PROGRESS,
  [`повернення коштів в обробці${SALE}`]: IN_PROGRESS,
  [UNCHECKED]:
    'Відкрийте це посилання ще раз за кілька хвилин. Якщо повторюється — повідомте розробнику.',
}

export function actionFor(problem: string): string {
  return ACTIONS[problem] ?? 'Повідомте розробнику: для цього випадку немає інструкції.'
}

export function renderReport(
  window: ReportWindow, checked: number, findings: Finding[], next?: { remaining: number; continuation: string }, resumed = false,
): string {
  const head = `Звірка оплат plata by mono: ${iso(window.fromUnix)} — ${iso(window.toUnix)} (UTC). Перевірено: ${checked}.`
  const lines = findings.map((f, i) => {
    const order = f.reference ? `, замовлення №${f.reference}` : ''
    const amounts = f.refund
      ? `сплачено ${formatKop(f.refund.chargedKop)}, повернуто ${formatKop(f.refund.chargedKop - f.refund.remainingKop)}, залишок ${formatKop(f.refund.remainingKop)}`
      : formatKop(f.amountKop)
    return `${i + 1}. ${f.problem} — інвойс mono ${f.invoiceId}${order}, ${amounts}\n   Що робити: ${actionFor(f.problem)}`
  })
  const results = findings.length > 0 ? `Потребує уваги (${findings.length}):\n\n${lines.join('\n\n')}` : ''
  const progress = next
    ? `Залишилось перевірити: ${next.remaining}. Щоб продовжити, додайте до початкового посилання цей параметр (або замініть попередній &resume):\n&resume=${encodeURIComponent(next.continuation)}`
    : ''
  const clean = resumed ? 'У цій частині звірки все гаразд.' : 'Все гаразд.'
  return [head, progress, results || (next ? '' : clean)].filter(Boolean).join('\n\n')
}

import { timingSafeEqual } from 'node:crypto'
import { formatKop } from '@/lib/format'
import { orderHealth, paymentMismatch, type CrmRemoteOrder } from '@/lib/hugeprofit/order-rules'
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
  // Date.parse rolls 2026-02-30 into March: only a date that round-trips is real.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value ? null : ms / 1000
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

const SITE_REFERENCE = /^\d{15}$/
const SALE = ' (замовлення вже переведено в продаж)'
const MISMATCH = 'замовлення в CRM не позначене як оплата цього інвойсу'

export type Finding ={ invoiceId: string; reference: string; amountKop: number; problem: string }

type Item = { invoiceId: string; status: string; amount: number; reference?: string; cancelList?: unknown[] }
type Current = { status: string; finalAmount?: number; cancelList?: unknown[] } | null

/** `ours` is already filtered to our integration; `current` is the invoice's live status, read only when needed. */
export function findingsFor(item: Item, ours: CrmRemoteOrder[], current: Current, warehouseId: string): Finding[] {
  const finding = (problem: string, amountKop = item.amount): Finding => ({
    invoiceId: item.invoiceId,
    reference: item.reference ?? '',
    amountKop,
    problem,
  })
  const status = current?.status ?? item.status
  // In progress = neither completed nor failed (a status-less entry counts, so we never prompt a second refund).
  const cancels = (current?.cancelList ?? item.cancelList ?? []).filter((c) => {
    const s = (c as { status?: unknown } | null)?.status
    return s !== 'failure' && s !== 'success'
  })
  // Site invoices carry a 15-digit reference (newReference); anything else was taken outside the site.
  if (!SITE_REFERENCE.test(item.reference ?? '')) return [finding('оплата не з сайту (без номера замовлення)')]
  if (ours.length === 0) {
    if (item.status !== 'success' || status !== 'success') return []
    // After a partial refund only the balance is still held: that is what to refund.
    return [finding(cancels.length > 0 ? 'повернення коштів в обробці' : 'оплачено, але замовлення в CRM немає', current?.finalAmount ?? item.amount)]
  }
  if (ours.length > 1) return [finding('кілька замовлень у CRM на одну оплату')]

  const order = ours[0]
  const sale = order.sales_id != null ? SALE : ''
  // Unverified whether a sale keeps these fields (cutover Task 7): sold orders are not flagged.
  const problems: string[] = sale === '' && paymentMismatch(order, item.invoiceId) ? [MISMATCH] : []
  const partial = status !== 'reversed' && current?.finalAmount !== undefined && current.finalAmount < item.amount
  // After a partial refund the operator removes lines, so the CRM total rightly stops matching the payment.
  if (!partial && toKop(order.price) !== item.amount) problems.push('сума в CRM не збігається з оплатою')
  problems.push(...orderHealth(order, warehouseId))
  if (status === 'reversed') problems.push(`кошти повернуто повністю${sale}`)
  else if (partial) problems.push(`кошти повернуто частково${sale}`)
  else if (cancels.length > 0) problems.push(`повернення коштів в обробці${sale}`)
  return problems.map((problem) => finding(problem))
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ')

const FIX_ORDER = 'Відкрийте замовлення в HugeProfit і виправте ціни й кількість у рядках, щоб сума збігалася з оплатою.'
const DEVELOPER = 'Повідомте розробнику: сайт не зміг прочитати це замовлення з CRM. Саме замовлення не чіпайте.'
// Refund lines stay while the payment is in the 7-day window, whatever the operator does in HugeProfit.
const ONCE = ' Зробіть це один раз: рядок повторюватиметься, доки оплата не вийде за межі 7 днів звірки. Повторно нічого не робіть.'
const IN_PROGRESS =
  'Поки нічого не робіть: повернення ще обробляється, зазвичай наступного дня рядок зміниться на повне або часткове повернення. Якщо не змінюється понад день — перевірте платіж у кабінеті mono.'

/* Keyed by the exact problem text (findingsFor, orderHealth). A finding repeats daily while it stays in the
   7-day window, so a one-off action says so (ONCE). */
const ACTIONS: Record<string, string> = {
  [MISMATCH]:
    'Відкрийте замовлення в HugeProfit: воно має бути позначене оплаченим, у гривнях, а в примітці — номер інвойсу mono з цього рядка. Якщо хтось змінив це вручну — поверніть як було. Якщо не змінював ніхто — повідомте розробнику.',
  'оплачено, але замовлення в CRM немає':
    'Поверніть кошти: у кабінеті mono (web.monobank.ua) знайдіть платіж за номером інвойсу і зробіть повернення. Після повернення рядок зникне. Що саме купили і хто, з цих даних не видно. Якщо покупець напише вам і ви створите замовлення в HugeProfit вручну — кошти НЕ повертайте; тоді рядок лишатиметься, доки оплата не вийде за межі 7 днів звірки.',
  'оплата не з сайту (без номера замовлення)':
    'Це оплата не через сайт: наприклад, за посиланням, створеним вручну в кабінеті mono. Якщо ви про неї знаєте — нічого не робіть. Якщо ні — перевірте платіж у кабінеті mono.',
  'кілька замовлень у CRM на одну оплату':
    'Залиште в HugeProfit одне замовлення з цим номером, решту видаліть — інакше товар зарезервовано кілька разів.',
  'сума в CRM не збігається з оплатою': FIX_ORDER,
  'сума замовлення не збігається із сумою рядків': FIX_ORDER,
  'не вдається прочитати суми рядків': DEVELOPER,
  'товар не зарезервовано':
    'Зарезервуйте товари цього замовлення в HugeProfit на складі магазину, інакше їх можуть продати вдруге.',
  'товар зарезервовано не на тому складі':
    'Перенесіть резерв цього замовлення в HugeProfit на склад магазину.',
  'кошти повернуто повністю':
    'Покупцю вже повернули гроші. Видаліть замовлення в HugeProfit, щоб звільнити резерв.' + ONCE,
  [`кошти повернуто повністю${SALE}`]:
    'Покупцю вже повернули гроші, а замовлення вже стало продажем. Оформіть повернення цього продажу в HugeProfit, щоб товар повернувся на склад.' + ONCE,
  'кошти повернуто частково':
    'Частину грошей повернули. Приберіть з замовлення в HugeProfit товари, за які повернули кошти.' + ONCE,
  [`кошти повернуто частково${SALE}`]:
    'Частину грошей повернули, а замовлення вже стало продажем. Оформіть у HugeProfit повернення тих товарів, за які повернули кошти.' + ONCE,
  'повернення коштів в обробці': IN_PROGRESS,
  [`повернення коштів в обробці${SALE}`]: IN_PROGRESS,
  'не вдалося перевірити — відкрийте звірку ще раз пізніше':
    'Відкрийте це посилання ще раз за кілька хвилин. Якщо повторюється — повідомте розробнику.',
}

export function actionFor(problem: string): string {
  return ACTIONS[problem] ?? 'Повідомте розробнику: для цього випадку немає інструкції.'
}

export function renderReport(window: { fromUnix: number; toUnix: number }, checked: number, findings: Finding[]): string {
  const head = `Звірка оплат plata by mono: ${iso(window.fromUnix)} — ${iso(window.toUnix)} (UTC). Перевірено: ${checked}.`
  if (findings.length === 0) return `${head}\n\nВсе гаразд.`
  const order = (ref: string) => (SITE_REFERENCE.test(ref) ? `, замовлення №${ref}` : '')
  const lines = findings.map(
    (f, i) =>
      `${i + 1}. ${f.problem} — інвойс mono ${f.invoiceId}${order(f.reference)}, ${formatKop(f.amountKop)}\n   Що робити: ${actionFor(f.problem)}`,
  )
  return `${head}\n\nПотребує уваги (${findings.length}):\n\n${lines.join('\n\n')}`
}

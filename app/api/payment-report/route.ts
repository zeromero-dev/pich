import { SHOP_WAREHOUSE_ID } from '@/lib/hugeprofit/client'
import { lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { ourOrders } from '@/lib/hugeprofit/order-rules'
import { getInvoiceStatus, getStatement } from '@/lib/mono/client'
import { parseIntegrationId } from '@/lib/mono/rules'
import {
  findingsFor, keyMatches, parseReportContinuation, renderReport, reportContinuation, reportStatementId,
  reportWindow, siteOrderReference, uncheckedFinding, type Finding,
} from '@/lib/mono/report'

/* Daily payment report (звірка), opened by the operator as a link (?key=REPORT_KEY, optional &from=&to=
   YYYY-MM-DD). Reads mono's statement and the CRM; never writes, never logs the URL. */

export const maxDuration = 60

const reply = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })

export async function GET(request: Request) {
  // Each provider read can take 10 s. Leave another 5 s to render and return within maxDuration.
  const stopStartingChecksAt = performance.now() + 45_000
  const params = new URL(request.url).searchParams
  if (!keyMatches(params.get('key'), process.env.REPORT_KEY)) return reply('Доступ заборонено.', 403)

  const now = new Date()
  const resume = params.get('resume')
  const continuation = resume === null ? null : parseReportContinuation(resume, now)
  if (resume !== null && !continuation) return reply('Невірний параметр продовження. Відкрийте початкове посилання на звірку.', 400)
  const window = continuation?.window ?? reportWindow(params.get('from'), params.get('to'), now)
  if (!window) return reply('Період: &from=YYYY-MM-DD&to=YYYY-MM-DD, не довше 31 дня; без них — останні 7 днів.', 400)

  const integrationId = parseIntegrationId(process.env.CRM_INTEGRATION_ID)
  if (integrationId === null) return reply('CRM_INTEGRATION_ID не налаштовано — звірка неможлива.', 503)

  let items: Awaited<ReturnType<typeof getStatement>>
  try {
    items = await getStatement(window.fromUnix, window.toUnix)
  } catch (error) {
    console.error('[payment-report] statement read failed', error instanceof Error ? error.message : error)
    return reply('Не вдалося отримати виписку mono. Спробуйте за кілька хвилин.', 502)
  }

  const byId = new Map(items.map((item) => [item.invoiceId, item]))
  const invoiceIds = [...byId.keys()].sort()
  const statementId = reportStatementId(invoiceIds)
  const after = continuation?.after ?? ''
  if (continuation && (continuation.statementId !== statementId || (after && !byId.has(after)))) {
    const restart = encodeURIComponent(reportContinuation(window, statementId, ''))
    return reply(`Виписка змінилася. Щоб перевірити весь період, замініть параметр продовження на:\n&resume=${restart}`, 409)
  }

  const warehouseId = String(SHOP_WAREHOUSE_ID)
  const check = async (item: (typeof items)[number]): Promise<Finding[]> => {
    const reference = siteOrderReference(item)
    if (!reference) return findingsFor(item, [], null, warehouseId)
    const [orders, current] = await Promise.allSettled([lookupRemoteOrders(reference), getInvoiceStatus(item.invoiceId)])
    if (orders.status === 'rejected' || current.status === 'rejected') return [uncheckedFinding(item)]
    try {
      const ours = ourOrders(orders.value, integrationId, reference)
      return findingsFor(item, ours, current.value, warehouseId)
    } catch {
      return [uncheckedFinding(item)]
    }
  }

  const remainingIds = invoiceIds.filter((id) => id > after)
  const findings: Finding[] = []
  let checked = 0
  // One invoice at a time keeps both providers' request rates bounded.
  for (const id of remainingIds) {
    if (checked > 0 && performance.now() >= stopStartingChecksAt) break
    // react-doctor-disable-next-line async-await-in-loop
    findings.push(...(await check(byId.get(id)!)))
    checked++
  }

  const remaining = remainingIds.length - checked
  const next = remaining > 0 ? { remaining, continuation: reportContinuation(window, statementId, remainingIds[checked - 1]) } : undefined
  return reply(renderReport(window, checked, findings, next, after !== ''))
}

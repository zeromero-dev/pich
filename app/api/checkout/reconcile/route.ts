import { SHOP_WAREHOUSE_ID } from '@/lib/hugeprofit/client'
import { lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { ourOrders } from '@/lib/hugeprofit/order-rules'
import { getInvoiceStatus, getStatement } from '@/lib/mono/client'
import { parseIntegrationId } from '@/lib/mono/rules'
import { findingsFor, keyMatches, renderReport, reportWindow, type Finding } from '@/lib/mono/report'

/* Daily reconciliation, opened by the operator as a link (?key=RECONCILE_KEY, optional &from=&to=
   YYYY-MM-DD). Reads mono's statement and the CRM; never writes, never logs the URL. */

export const maxDuration = 60

const reply = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  if (!keyMatches(params.get('key'), process.env.RECONCILE_KEY)) return reply('Доступ заборонено.', 403)

  const window = reportWindow(params.get('from'), params.get('to'), new Date())
  if (!window) return reply('Період: &from=YYYY-MM-DD&to=YYYY-MM-DD, не довше 31 дня; без них — останні 7 днів.', 400)

  let items: Awaited<ReturnType<typeof getStatement>>
  try {
    items = await getStatement(window.fromUnix, window.toUnix)
  } catch (error) {
    console.error('[reconcile] statement read failed', error instanceof Error ? error.message : error)
    return reply('Не вдалося отримати виписку mono. Спробуйте за кілька хвилин.', 502)
  }

  const integrationId = parseIntegrationId(process.env.CRM_INTEGRATION_ID)
  if (integrationId === null) return reply('CRM_INTEGRATION_ID не налаштовано — звірка неможлива.', 503)
  const warehouseId = String(SHOP_WAREHOUSE_ID)
  const check = async (item: (typeof items)[number]): Promise<Finding[]> => {
    try {
      const ours = item.reference ? ourOrders(await lookupRemoteOrders(item.reference), integrationId, item.reference) : []
      const needsStatus = item.status !== 'success' || (item.cancelList?.length ?? 0) > 0 || ours.length === 1
      const current = needsStatus ? await getInvoiceStatus(item.invoiceId) : null
      return findingsFor(item, ours, current, warehouseId)
    } catch {
      return [{ invoiceId: item.invoiceId, reference: item.reference ?? '', amountKop: item.amount, problem: 'could not check (retry)' }]
    }
  }
  const findings: Finding[] = []
  // ponytail: sequential on purpose — CRM rate limits are undocumented; a shop's daily volume is small.
  for (const item of items) {
    // react-doctor-disable-next-line async-await-in-loop
    findings.push(...(await check(item)))
  }

  return reply(renderReport(window, items.length, findings))
}

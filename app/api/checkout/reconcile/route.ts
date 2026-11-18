import { SHOP_WAREHOUSE_ID } from '@/lib/hugeprofit/client'
import { lookupRemoteOrders } from '@/lib/hugeprofit/orders'
import { getInvoiceStatus, getStatement } from '@/lib/mono/client'
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

  const integrationId = Number(process.env.CRM_INTEGRATION_ID)
  const warehouseId = String(SHOP_WAREHOUSE_ID)
  const findings: Finding[] = []
  // ponytail: sequential CRM/mono calls — a shop's daily volume; batch if the list grows into the hundreds.
  for (const item of items) {
    try {
      // react-doctor-disable-next-line async-await-in-loop
      const ours = item.reference
        ? (await lookupRemoteOrders(item.reference)).filter((order) => order.integration_id === integrationId)
        : []
      const needsStatus = item.status !== 'success' || (item.cancelList?.length ?? 0) > 0 || ours.length === 1
      // react-doctor-disable-next-line async-await-in-loop
      const current = needsStatus ? await getInvoiceStatus(item.invoiceId) : null
      findings.push(...findingsFor(item, ours, current, warehouseId))
    } catch {
      findings.push({ invoiceId: item.invoiceId, reference: item.reference ?? '', amountKop: item.amount, problem: 'could not check (retry)' })
    }
  }

  return reply(renderReport(window, items.length, findings))
}

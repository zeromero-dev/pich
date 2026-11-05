import 'server-only'

import { getWarehouse, searchSettlements, searchStreets } from '@/lib/nova-poshta'
import type { OrderDelivery } from '@/lib/hugeprofit/orders'
import type { ParsedDelivery } from './schema'

const PICKUP: OrderDelivery = {
  method: 'pickup',
  city: 'Вінниця',
  address: 'Самовивіз: вул. Григорія Сковороди, 25 (Plai Pich)',
}

/**
 * Re-derives the address text from Nova Poshta so the order never carries
 * buyer-typed branch names. `null` = the selection doesn't check out; NP being
 * down throws, which the caller must tell apart from a bad selection.
 */
export async function resolveDelivery(delivery: ParsedDelivery): Promise<OrderDelivery | null> {
  switch (delivery.method) {
    case 'pickup':
      return PICKUP

    case 'branch':
    case 'locker': {
      const warehouse = await getWarehouse(delivery.warehouseRef, delivery.method)
      if (!warehouse || warehouse.settlementRef !== delivery.settlementRef) return null
      return { method: delivery.method, city: warehouse.city, address: warehouse.label }
    }

    case 'courier': {
      const [settlements, streets] = await Promise.all([
        searchSettlements(delivery.settlementName),
        searchStreets(delivery.settlementRef, delivery.streetName),
      ])
      const settlement = settlements.find((s) => s.ref === delivery.settlementRef)
      const street = streets.find((s) => s.ref === delivery.streetRef)
      if (!settlement?.courier || !street) return null
      const flat = delivery.flat ? `, кв. ${delivery.flat}` : ''
      return {
        method: 'courier',
        city: settlement.label,
        address: `Курʼєр: ${street.label}, ${delivery.house}${flat}`,
      }
    }
  }
}

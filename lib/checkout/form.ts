import { z } from 'zod'
import type { SettlementOption, StreetOption, WarehouseOption } from '@/lib/nova-poshta/types'
import {
  contactSchema,
  deliverySchema,
  fieldErrors,
  type CheckoutErrorKey,
  type CheckoutRequest,
  type DeliveryMethod,
  type FieldId,
} from './schema'

/** Checkout form state: picked NP options, not just refs, so inputs can show labels. */

export type ContactState = { name: string; email: string; phone: string }

export type DeliveryState = {
  method: DeliveryMethod
  settlement: SettlementOption | null
  warehouse: WarehouseOption | null
  street: StreetOption | null
  house: string
  flat: string
}

export const EMPTY_CONTACT: ContactState = { name: '', email: '', phone: '' }

export const EMPTY_DELIVERY: DeliveryState = {
  method: 'branch',
  settlement: null,
  warehouse: null,
  street: null,
  house: '',
  flat: '',
}

export type FormErrorKey = CheckoutErrorKey | 'noCourier'

const formSchema = z.object({ contact: contactSchema, delivery: deliverySchema })

export function toRequest(contact: ContactState, d: DeliveryState): Omit<CheckoutRequest, 'items'> {
  const settlementRef = d.settlement?.ref ?? ''
  const delivery: CheckoutRequest['delivery'] =
    d.method === 'pickup'
      ? { method: 'pickup' }
      : d.method === 'courier'
        ? {
            method: 'courier',
            settlementRef,
            settlementName: d.settlement?.name ?? '',
            streetRef: d.street?.ref ?? '',
            streetName: d.street?.name ?? '',
            house: d.house,
            flat: d.flat.trim() || undefined,
          }
        : { method: d.method, settlementRef, warehouseRef: d.warehouse?.ref ?? '' }
  return { contact, delivery }
}

export function validateForm(contact: ContactState, d: DeliveryState): Partial<Record<FieldId, FormErrorKey>> {
  const result = formSchema.safeParse(toRequest(contact, d))
  const errors: Partial<Record<FieldId, FormErrorKey>> = result.success ? {} : fieldErrors(result.error.issues)
  // The server would reject it too, but only the form knows the town's courier flag up front.
  if (d.method === 'courier' && d.settlement && !d.settlement.courier) errors.settlementRef = 'noCourier'
  return errors
}

import 'server-only'

import { npCall } from './client'
import type { SettlementOption, StreetOption, WarehouseKind, WarehouseOption } from './types'

/**
 * Address lookups for checkout. Field names below were read off live responses
 * 2026-10-29, not just the docs. `getWarehouses` takes one type ref per call, and
 * a city's list is mostly lockers (Вінниця: 461 of 500), so branches are fetched
 * per type rather than filtered out of a mixed page.
 */

// From AddressGeneral.getWarehouseTypes. PrivatBank lockers are left out.
const BRANCH_TYPES = [
  '841339c7-591a-42e2-8233-7a0a00f0ed6f', // Поштове(ий)
  '9a68df70-0267-42a8-bb5c-37f427e36ee4', // Вантажне(ий)
  '6f8c7162-4b72-4b0a-88e5-906948c6a92f', // Поштове відділення з обмеженнями
]
const LOCKER_TYPE = 'f9316480-5f2d-425d-bc2c-ac7cd29decf0'

const CATEGORY: Record<WarehouseKind, string> = { branch: 'Branch', locker: 'Postomat' }

const PAGE = '50'

type RawSettlement = {
  Ref: string
  MainDescription: string
  Present: string
  Warehouses: number
  AddressDeliveryAllowed: boolean
}

type RawWarehouse = {
  Ref: string
  Number: string
  Description: string
  CategoryOfWarehouse: string
  WarehouseStatus: string
  SettlementRef: string
  SettlementDescription: string
  SettlementAreaDescription: string
}

type RawStreet = {
  SettlementStreetRef: string
  SettlementStreetDescription: string
  Present: string
}

export async function searchSettlements(query: string): Promise<SettlementOption[]> {
  const [result] = await npCall<{ Addresses: RawSettlement[] }>('Address', 'searchSettlements', {
    CityName: query,
    Limit: '20',
    Page: '1',
  })
  return (result?.Addresses ?? [])
    .filter((s) => s.Warehouses > 0 || s.AddressDeliveryAllowed)
    .map((s) => ({
      ref: s.Ref,
      name: s.MainDescription,
      label: s.Present,
      courier: s.AddressDeliveryAllowed,
    }))
}

function isUsable(w: RawWarehouse, kind: WarehouseKind): boolean {
  return w.CategoryOfWarehouse === CATEGORY[kind] && w.WarehouseStatus === 'Working'
}

export async function listWarehouses(
  settlementRef: string,
  kind: WarehouseKind,
  query: string,
): Promise<WarehouseOption[]> {
  const types = kind === 'branch' ? BRANCH_TYPES : [LOCKER_TYPE]
  const pages = await Promise.all(
    types.map((type) =>
      npCall<RawWarehouse>('AddressGeneral', 'getWarehouses', {
        SettlementRef: settlementRef,
        TypeOfWarehouseRef: type,
        FindByString: query,
        Limit: PAGE,
        Page: '1',
      }),
    ),
  )
  // The same branch comes back under more than one type query (seen live), so dedupe by ref.
  const unique = new Map(pages.flat().filter((w) => isUsable(w, kind)).map((w) => [w.Ref, w]))
  return [...unique.values()]
    .sort((a, b) => Number(a.Number) - Number(b.Number))
    .map((w) => ({ ref: w.Ref, label: w.Description }))
}

export type ResolvedWarehouse = {
  settlementRef: string
  city: string
  label: string
}

/** `null` when the ref is unknown, closed, or not the kind the buyer chose. */
export async function getWarehouse(ref: string, kind: WarehouseKind): Promise<ResolvedWarehouse | null> {
  const [w] = await npCall<RawWarehouse>('AddressGeneral', 'getWarehouses', { Ref: ref })
  if (!w || w.Ref !== ref || !isUsable(w, kind)) return null
  return {
    settlementRef: w.SettlementRef,
    city: `${w.SettlementDescription}, ${w.SettlementAreaDescription} обл.`,
    label: w.Description,
  }
}

export async function searchStreets(settlementRef: string, query: string): Promise<StreetOption[]> {
  const [result] = await npCall<{ Addresses: RawStreet[] }>('Address', 'searchSettlementStreets', {
    SettlementRef: settlementRef,
    StreetName: query,
    Limit: PAGE,
  })
  return (result?.Addresses ?? []).map((s) => ({
    ref: s.SettlementStreetRef,
    name: s.SettlementStreetDescription,
    label: s.Present,
  }))
}

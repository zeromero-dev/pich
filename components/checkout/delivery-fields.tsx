'use client'

import { useLocale } from '@/components/providers'
import { Combobox } from '@/components/checkout/combobox'
import { TextField } from '@/components/checkout/text-field'
import { DELIVERY_METHODS, type DeliveryMethod, type FieldId } from '@/lib/checkout/schema'
import type { DeliveryState } from '@/lib/checkout/form'
import type { SettlementOption, StreetOption, WarehouseOption } from '@/lib/nova-poshta/types'
import { cn } from '@/lib/utils'

async function lookup<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T[]> {
  const res = await fetch(`/api/nova-poshta/${path}?${new URLSearchParams(params)}`, { signal })
  if (!res.ok) throw new Error(`lookup ${path} responded ${res.status}`)
  return res.json()
}

const loadSettlements = (q: string, signal: AbortSignal) => lookup<SettlementOption>('settlements', { q }, signal)

export function DeliveryFields({
  state,
  onChange,
  errorFor,
  onBlur,
}: {
  state: DeliveryState
  onChange: (patch: Partial<DeliveryState>) => void
  errorFor: (field: FieldId) => string | undefined
  onBlur: (field: FieldId) => void
}) {
  const { t } = useLocale()
  const { method, settlement } = state

  const labels: Record<DeliveryMethod, { title: string; hint?: string }> = {
    pickup: { title: t.checkout.methodPickup, hint: `${t.footer.street} · ${t.footer.hoursValue}` },
    branch: { title: t.checkout.methodBranch },
    locker: { title: t.checkout.methodLocker },
    courier: { title: t.checkout.methodCourier },
  }

  return (
    <>
      <div role="radiogroup" aria-label={t.checkout.delivery} className="grid gap-2 sm:grid-cols-2">
        {DELIVERY_METHODS.map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-2xl border px-4 py-3 transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
              method === option ? 'border-ink' : 'border-ink/15 hover:border-ink/40',
            )}
          >
            <input
              type="radio"
              name="delivery-method"
              value={option}
              checked={method === option}
              // A branch ref is not a locker ref; the town carries over, the point doesn't.
              onChange={() => onChange({ method: option, warehouse: null })}
              className="sr-only"
            />
            <span className="text-sm font-medium text-ink">{labels[option].title}</span>
            {labels[option].hint && <span className="text-xs text-ink-soft">{labels[option].hint}</span>}
          </label>
        ))}
      </div>

      {method !== 'pickup' && (
        <Combobox
          id="settlementRef"
          label={t.checkout.settlement}
          value={settlement}
          onSelect={(next) => onChange({ settlement: next, warehouse: null, street: null })}
          load={loadSettlements}
          error={errorFor('settlementRef')}
          onBlur={() => onBlur('settlementRef')}
        />
      )}

      {(method === 'branch' || method === 'locker') && settlement && (
        <>
          <Combobox
            // Remount per town and kind so a stale list never shows.
            key={`${method}-${settlement.ref}`}
            id="warehouseRef"
            label={method === 'branch' ? t.checkout.branch : t.checkout.locker}
            value={state.warehouse}
            onSelect={(next) => onChange({ warehouse: next })}
            load={(q, signal) => lookup<WarehouseOption>('warehouses', { settlement: settlement.ref, kind: method, q }, signal)}
            minChars={0}
            error={errorFor('warehouseRef')}
            onBlur={() => onBlur('warehouseRef')}
          />
          {method === 'locker' && <p className="-mt-2 pl-1 text-xs text-ink-soft">{t.checkout.lockerNote}</p>}
        </>
      )}

      {method === 'courier' && settlement && settlement.courier && (
        <>
          <Combobox
            key={settlement.ref}
            id="streetRef"
            label={t.checkout.street}
            value={state.street}
            onSelect={(next) => onChange({ street: next })}
            load={(q, signal) => lookup<StreetOption>('streets', { settlement: settlement.ref, q }, signal)}
            error={errorFor('streetRef')}
            onBlur={() => onBlur('streetRef')}
          />
          <div className="grid grid-cols-2 items-end gap-4">
            <TextField
              id="house"
              label={t.checkout.house}
              value={state.house}
              error={errorFor('house')}
              onChange={(v) => onChange({ house: v })}
              onBlur={() => onBlur('house')}
            />
            <TextField
              id="flat"
              label={`${t.checkout.flat} (${t.checkout.optional})`}
              value={state.flat}
              error={errorFor('flat')}
              onChange={(v) => onChange({ flat: v })}
              onBlur={() => onBlur('flat')}
            />
          </div>
        </>
      )}
    </>
  )
}

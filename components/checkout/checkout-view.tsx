'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import { PillButton, PillLink } from '@/components/pill-button'
import { TextField } from '@/components/checkout/text-field'
import { DeliveryFields } from '@/components/checkout/delivery-fields'
import {
  EMPTY_CONTACT,
  EMPTY_DELIVERY,
  toRequest,
  validateForm,
  type ContactState,
  type DeliveryState,
} from '@/lib/checkout/form'
import type { FieldId } from '@/lib/checkout/schema'

function redirectToLiqPay(checkoutUrl: string, data: string, signature: string) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = checkoutUrl
  for (const [name, value] of [
    ['data', data],
    ['signature', signature],
  ]) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export function CheckoutView() {
  const { t } = useLocale()
  const { items, subtotal, setQty } = useCart()
  const [contact, setContact] = useState<ContactState>(EMPTY_CONTACT)
  const [delivery, setDelivery] = useState<DeliveryState>(EMPTY_DELIVERY)
  // Errors show after a field's first blur, then track every change: "reward early, punish late".
  const [touched, setTouched] = useState<ReadonlySet<FieldId>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const errors = validateForm(contact, delivery)
  const errorFor = (field: FieldId) => {
    const key = errors[field]
    // Not a typing mistake, so it shows as soon as the town is picked.
    if (key === 'noCourier') return t.checkout.noCourier
    return key && touched.has(field) ? t.checkout[key] : undefined
  }
  const touch = (field: FieldId) => setTouched((prev) => new Set(prev).add(field))
  const setField = (field: keyof ContactState, value: string) => setContact((c) => ({ ...c, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (Object.keys(errors).length > 0) {
      setTouched(new Set(Object.keys(errors) as FieldId[]))
      document.getElementById(Object.keys(errors)[0])?.focus()
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ product, qty }) => ({
            workId: product.id,
            qty,
            price: product.price,
          })),
          ...toRequest(contact, delivery),
        }),
      })
      const body = await res.json()

      if (!res.ok) {
        if (body?.error === 'insufficient' && Array.isArray(body.short)) {
          for (const line of body.short as { workId: string; available: number }[]) {
            setQty(line.workId, line.available)
          }
        }
        setSubmitError(
          body?.error === 'unavailable'
            ? t.checkout.errorUnavailable
            : body?.error === 'insufficient'
              ? t.checkout.errorInsufficient
              : body?.error === 'repriced'
                ? t.checkout.errorRepriced
                : body?.error === 'payments_disabled'
                  ? t.checkout.errorPaymentsDisabled
                  : body?.error === 'delivery'
                    ? t.checkout.errorDelivery
                    : body?.error === 'delivery_unavailable'
                      ? t.checkout.errorDeliveryUnavailable
                      : t.checkout.errorGeneric,
        )
        setSubmitting(false)
        return
      }

      // Full-page navigation to LiqPay — cart stays in localStorage until
      // /checkout/result clears it on confirmed payment.
      redirectToLiqPay(body.checkoutUrl, body.data, body.signature)
    } catch {
      setSubmitError(t.checkout.errorGeneric)
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.cart.empty}</h1>
        <p className="mt-3 text-base text-ink-soft">{t.cart.emptyBody}</p>
        <PillLink href="/shop" className="mt-8">
          {t.cart.continue}
        </PillLink>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 md:px-6 md:pt-10 md:pb-24">
      <Link
        href="/shop"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        {t.shop.backToShop}
      </Link>

      <h1 className="mt-6 text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink md:text-4xl">
        {t.checkout.title}
      </h1>

      <section className="mt-8 rounded-2xl bg-surface-alt p-5">
        <h2 className="text-sm font-semibold text-ink">{t.checkout.summary}</h2>
        <ul className="mt-4 divide-y divide-hairline">
          {items.map(({ product, qty }) => (
            <li key={product.id} className="flex items-center gap-4 py-3">
              <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                <img
                  src={product.images[0] || '/placeholder.svg'}
                  alt={product.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-contain p-1"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                <p className="text-xs text-ink-soft">
                  {qty} × {formatPrice(product.price)}
                </p>
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums">
                {formatPrice(product.price * qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
          <span className="text-sm text-ink-soft">{t.cart.subtotal}</span>
          <span className="text-xl font-semibold text-ink tabular-nums">{formatPrice(subtotal)}</span>
        </div>
      </section>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.contact}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="firstName" label={t.checkout.firstName} value={contact.firstName} error={errorFor('firstName')}
              onChange={(v) => setField('firstName', v)} onBlur={() => touch('firstName')} autoComplete="given-name" />
            <TextField id="lastName" label={t.checkout.lastName} value={contact.lastName} error={errorFor('lastName')}
              onChange={(v) => setField('lastName', v)} onBlur={() => touch('lastName')} autoComplete="family-name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="phone" label={t.checkout.phone} type="tel" inputMode="tel" placeholder="067 123 45 67"
              value={contact.phone} error={errorFor('phone')}
              onChange={(v) => setField('phone', v)} onBlur={() => touch('phone')} autoComplete="tel" />
            <TextField id="email" label={`${t.checkout.email} (${t.checkout.optional})`} type="email" value={contact.email} error={errorFor('email')}
              onChange={(v) => setField('email', v)} onBlur={() => touch('email')} autoComplete="email" />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.delivery}</legend>
          <DeliveryFields
            state={delivery}
            onChange={(patch) => setDelivery((d) => ({ ...d, ...patch }))}
            errorFor={errorFor}
            onBlur={touch}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.payment}</legend>
          <div className="mt-3 rounded-2xl border border-hairline bg-surface-alt/60 p-5 text-sm leading-relaxed text-ink-soft">
            {t.checkout.paymentNote}
          </div>
        </fieldset>

        {submitError && (
          <p
            role="alert"
            className="rounded-2xl border border-ink/15 bg-surface-alt px-5 py-4 text-sm leading-relaxed text-ink"
          >
            {submitError}
          </p>
        )}

        <PillButton type="submit" size="hero" disabled={submitting} className="w-full">
          {submitting ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-surface/30 border-t-surface" aria-hidden="true" />
          ) : (
            t.checkout.place
          )}
        </PillButton>
      </form>
    </main>
  )
}


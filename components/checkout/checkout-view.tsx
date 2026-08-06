'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Check, ArrowLeft } from 'lucide-react'
import { spring } from '@/lib/motion'
import { formatPrice } from '@/lib/format'
import { useCart, useLocale } from '@/components/providers'
import { PillButton, PillLink } from '@/components/pill-button'
import { cn } from '@/lib/utils'

type Fields = 'name' | 'email' | 'phone' | 'city' | 'address'

export function CheckoutView() {
  const { t } = useLocale()
  const { items, subtotal, clear } = useCart()
  const [values, setValues] = useState<Record<Fields, string>>({
    name: '',
    email: '',
    phone: '',
    city: '',
    address: '',
  })
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({})
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const validateField = (field: Fields, value: string): string | undefined => {
    if (!value.trim()) return t.checkout.required
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return t.checkout.invalidEmail
    }
    return undefined
  }

  const setField = (field: Fields, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    // Re-validate on change only after the first error ("reward early, punish late").
    if (touched[field]) {
      setErrors((e) => ({ ...e, [field]: validateField(field, value) }))
    }
  }

  const onBlur = (field: Fields) => {
    setTouched((tc) => ({ ...tc, [field]: true }))
    setErrors((e) => ({ ...e, [field]: validateField(field, values[field]) }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const fields: Fields[] = ['name', 'email', 'phone', 'city', 'address']
    const nextErrors: Partial<Record<Fields, string>> = {}
    fields.forEach((f) => {
      const err = validateField(f, values[f])
      if (err) nextErrors[f] = err
    })
    setErrors(nextErrors)
    setTouched(Object.fromEntries(fields.map((f) => [f, true])))
    if (Object.keys(nextErrors).length > 0) return
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setDone(true)
      clear()
    }, 700)
  }

  if (done) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center md:px-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.snap}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-ink"
        >
          <Check className="size-7 text-surface" aria-hidden="true" />
        </motion.div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-ink">
          {t.checkout.successTitle}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft text-pretty">
          {t.checkout.successBody}
        </p>
        <PillLink href="/shop" className="mt-8">
          {t.cart.continue}
        </PillLink>
      </main>
    )
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center md:px-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t.cart.empty}</h1>
        <p className="mt-3 text-base text-ink-soft">{t.cart.emptyBody}</p>
        <PillLink href="/shop" className="mt-8">
          {t.cart.continue}
        </PillLink>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-8 md:px-6 md:pt-10">
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

      {/* Order summary */}
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
          <Field id="name" label={t.checkout.name} value={values.name} error={errors.name}
            onChange={(v) => setField('name', v)} onBlur={() => onBlur('name')} autoComplete="name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label={t.checkout.email} type="email" value={values.email} error={errors.email}
              onChange={(v) => setField('email', v)} onBlur={() => onBlur('email')} autoComplete="email" />
            <Field id="phone" label={t.checkout.phone} type="tel" value={values.phone} error={errors.phone}
              onChange={(v) => setField('phone', v)} onBlur={() => onBlur('phone')} autoComplete="tel" />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.delivery}</legend>
          <Field id="city" label={t.checkout.city} value={values.city} error={errors.city}
            onChange={(v) => setField('city', v)} onBlur={() => onBlur('city')} autoComplete="address-level2" />
          <Field id="address" label={t.checkout.address} value={values.address} error={errors.address}
            onChange={(v) => setField('address', v)} onBlur={() => onBlur('address')} autoComplete="street-address" />
        </fieldset>

        {/* Payment — swappable stub section (provider TBD). */}
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink">{t.checkout.payment}</legend>
          <div className="mt-3 rounded-2xl border border-dashed border-ink/20 bg-surface-alt/60 p-5 text-sm leading-relaxed text-ink-soft">
            {t.checkout.paymentStub}
          </div>
        </fieldset>

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

function Field({
  id,
  label,
  value,
  error,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (v: string) => void
  onBlur: () => void
  type?: string
  autoComplete?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'h-11 rounded-full border bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint',
          error
            ? 'border-error focus:border-error'
            : 'border-ink/15 focus:border-ink',
        )}
      />
      {error && (
        <p id={`${id}-error`} className="pl-1 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

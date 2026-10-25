'use client'

import { Minus, Plus } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { cn } from '@/lib/utils'

export function QtyStepper({
  value,
  max,
  onChange,
  size = 'lg',
}: {
  value: number
  max: number
  onChange: (n: number) => void
  size?: 'sm' | 'lg'
}) {
  const { t } = useLocale()
  const button = cn(
    'inline-flex items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-35',
    size === 'lg' ? 'h-full w-12' : 'h-full w-8',
  )
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-ink/15',
        size === 'lg' ? 'h-[3.25rem]' : 'h-8',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={t.cart.decrease}
        className={button}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className={cn('text-center font-medium text-ink tabular-nums', size === 'lg' ? 'min-w-8 text-base' : 'min-w-6 text-sm')}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t.cart.increase}
        className={button}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

'use client'

import { cn } from '@/lib/utils'

export function TextField({
  id,
  label,
  value,
  error,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (v: string) => void
  onBlur: () => void
  type?: string
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
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
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          'h-11 rounded-full border bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint',
          error ? 'border-error focus:border-error' : 'border-ink/15 focus:border-ink',
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

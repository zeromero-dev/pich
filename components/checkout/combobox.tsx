'use client'

import { useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocale } from '@/components/providers'
import type { Dictionary } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Option = { ref: string; label: string }

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'short'

const DEBOUNCE_MS = 250

/** Debounced, abortable search; only the latest query's results land. */
function useRemoteOptions<T>(load: (query: string, signal: AbortSignal) => Promise<T[]>, minChars: number) {
  const [options, setOptions] = useState<T[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [active, setActive] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inflight = useRef<AbortController>(undefined)

  const search = (query: string) => {
    clearTimeout(timer.current)
    inflight.current?.abort()
    if (query.trim().length < minChars) {
      setOptions([])
      setStatus('short')
      return
    }
    setStatus('loading')
    timer.current = setTimeout(async () => {
      const controller = new AbortController()
      inflight.current = controller
      try {
        const found = await load(query.trim(), controller.signal)
        setOptions(found)
        setActive(found.length > 0 ? 0 : -1)
        setStatus('ready')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }, DEBOUNCE_MS)
  }

  return { options, status, active, setActive, search }
}

function statusMessage(status: Status, count: number, t: Dictionary): string | null {
  if (status === 'loading') return t.checkout.lookupLoading
  if (status === 'error') return t.checkout.lookupError
  if (status === 'short') return t.checkout.lookupTypeMore
  if (status === 'ready' && count === 0) return t.checkout.lookupEmpty
  return null
}

/**
 * WAI-ARIA combobox over a remote list. Only a picked option counts — free text
 * clears the selection, because checkout needs NP refs, not typed names. Remount
 * with a new `key` to reset it when its parent selection changes.
 */
export function Combobox<T extends Option>({
  id,
  label,
  value,
  onSelect,
  load,
  minChars = 2,
  disabled = false,
  placeholder,
  error,
  onBlur,
}: {
  id: string
  label: string
  value: T | null
  onSelect: (option: T | null) => void
  load: (query: string, signal: AbortSignal) => Promise<T[]>
  minChars?: number
  disabled?: boolean
  placeholder?: string
  error?: string
  onBlur?: () => void
}) {
  const { t } = useLocale()
  const listId = useId()
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const { options, status, active, setActive, search } = useRemoteOptions(load, minChars)

  const pick = (option: T) => {
    setText(option.label)
    setOpen(false)
    onSelect(option)
  }

  const onInput = (next: string) => {
    setText(next)
    setOpen(true)
    if (value) onSelect(null)
    search(next)
  }

  const onFocus = () => {
    // A picked town's label is not a useful query; browsing lists (minChars 0) still open.
    if (value && minChars > 0) return
    setOpen(true)
    if (status === 'idle' || status === 'error') search(value ? '' : text)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const message = statusMessage(status, options.length, t)
  const expanded = open && (options.length > 0 || message !== null) && status !== 'idle'
  const optionId = (index: number) => `${listId}-${index}`

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 && options[active] ? optionId(active) : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder={placeholder ?? t.checkout.searchPlaceholder}
          disabled={disabled}
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false)
            onBlur?.()
          }}
          className={cn(
            'h-11 w-full rounded-full border bg-surface pr-10 pl-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-error focus:border-error' : 'border-ink/15 focus:border-ink',
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-soft"
          aria-hidden="true"
        />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!expanded}
        className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-hairline bg-surface p-1.5 shadow-lg"
      >
        {status === 'ready' &&
          options.map((option, index) => (
            <li
              key={option.ref}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(option)
              }}
              onMouseMove={() => setActive(index)}
              className={cn(
                'cursor-pointer rounded-xl px-3 py-2.5 text-sm leading-snug text-ink',
                index === active && 'bg-surface-alt',
              )}
            >
              {option.label}
            </li>
          ))}
        {message && (
          <li role="presentation" className="px-3 py-2.5 text-sm text-ink-soft">
            {message}
          </li>
        )}
      </ul>

      {error && (
        <p id={`${id}-error`} className="pl-1 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

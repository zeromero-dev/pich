'use client'

import { useId, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { Check, ChevronDown } from 'lucide-react'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'

type Option<V extends string> = { value: V; label: string }

/**
 * WAI-ARIA select-only combobox: focus stays on the button, aria-activedescendant
 * walks the list. Same shape as checkout/combobox.tsx, minus the text input.
 */
export function Select<V extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: V
  options: Option<V>[]
  onChange: (value: V) => void
}) {
  const listId = useId()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = Math.max(0, options.findIndex((o) => o.value === value))

  const show = () => {
    setActive(selected)
    setOpen(true)
  }
  const pick = (index: number) => {
    onChange(options[index].value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }
    if (e.key in moves) {
      e.preventDefault()
      setActive(moves[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={(e) => {
          // Safari doesn't focus buttons on click; without focus, blur never closes the list.
          e.currentTarget.focus()
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={cn(
          'flex h-11 w-full items-center rounded-full border bg-surface pr-10 pl-4 text-left text-sm text-ink outline-none transition-colors hover:border-ink/30 focus-visible:border-ink',
          open ? 'border-ink' : 'border-ink/15',
        )}
      >
        {/* Every label stacked in one cell: the button keeps the widest one's width. */}
        <span className="grid">
          {options.map((o) => (
            <span key={o.value} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {o.label}
            </span>
          ))}
          <span className="col-start-1 row-start-1 whitespace-nowrap">{options[selected].label}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-soft transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <m.ul
            id={listId}
            role="listbox"
            aria-labelledby={id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={reduced ? { duration: 0.15 } : spring.snap}
            className="absolute top-full right-0 z-20 mt-1.5 min-w-full origin-top rounded-2xl border border-hairline bg-surface p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
          >
            {options.map((o, index) => (
              <li
                key={o.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === selected}
                // mousedown, not click: the button's blur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(index)
                }}
                onMouseMove={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap text-ink',
                  index === active && 'bg-surface-alt',
                  index === selected && 'font-medium',
                )}
              >
                {o.label}
                <Check
                  aria-hidden="true"
                  className={cn('size-4 shrink-0', index !== selected && 'invisible')}
                />
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

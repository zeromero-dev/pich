import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Placeholder wordmark. The real logo lands in public/ later; if it's colored,
 * it becomes the single colored UI element. This text mark stays monochrome.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Плай Піч — на головну"
      className={cn(
        'inline-flex items-baseline gap-1.5 text-ink transition-opacity hover:opacity-80',
        className,
      )}
    >
      <span className="text-lg font-semibold tracking-[-0.02em]">Плай&nbsp;Піч</span>
      <span
        aria-hidden="true"
        className="mb-0.5 inline-block h-1.5 w-1.5 rounded-full bg-ink"
      />
    </Link>
  )
}

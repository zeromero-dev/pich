import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The mark is the word "ПІЧ" set vertically inside the block form. Both tones are
 * currentColor at different opacities so it inherits the monochrome ink token.
 */
export function LogoMark({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="400.1 181 399.8 836.8"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <g fillOpacity={0.949}>
        <path d="M400.1 181H799.9V590.3H679.4V282.3H519.9V590.3H400.1Z" />
        <path d="M400.1 605.8H519.9V756H679.4V605.8H799.9V1017.8H681.3V864.9H400.1Z" />
      </g>
      <g fillOpacity={0.8}>
        <path d="M538.4 439.2H658.2V480H617.2V555.4H538.4V514.7H578.7V480H538.4Z" />
        <path d="M538.4 567.3H575.3V611.2H538.4Z" />
        <path d="M581.2 567.3H658.2V611.2H581.2Z" />
        <path d="M538.4 624H658.2V665.4H575.5V700.2H658.2V742.7H538.4Z" />
      </g>
    </svg>
  )
}

export function Logo({
  className,
  showWordmark = false,
  onClick,
}: {
  className?: string
  showWordmark?: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label="Плай Піч — на головну"
      className={cn(
        'inline-flex items-center gap-2.5 text-ink transition-opacity hover:opacity-80',
        className,
      )}
    >
      <LogoMark className="h-10 w-auto" />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-[-0.02em]">Плай&nbsp;Піч</span>
      )}
    </Link>
  )
}

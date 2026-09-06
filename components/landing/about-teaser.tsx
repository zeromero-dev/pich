'use client'

import { ArrowRight } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { Reveal } from '@/components/reveal'

export function AboutTeaser() {
  const { t } = useLocale()

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <Reveal className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-surface-alt md:order-last">
          <img
            src="/images/template.jpg"
            alt="Інтерʼєр арт-центру Плай Піч: стіна, завішана картинами"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink text-balance md:text-3xl">
            {t.landing.aboutTitle}
          </h2>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-soft text-pretty">
            {t.landing.aboutBody}
          </p>
          <PillLink href="/about" variant="secondary" className="mt-6">
            {t.landing.aboutCta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </PillLink>
        </Reveal>
      </div>
    </section>
  )
}

'use client'

import { ArrowRight } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { Reveal } from '@/components/reveal'

/* Static on purpose — brief §2.4: this block must not depend on event data. */
export function EventsTeaser() {
  const { t } = useLocale()

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
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
            {t.landing.eventsTitle}
          </h2>
          {t.landing.eventsBody.map((paragraph) => (
            <p key={paragraph} className="mt-4 max-w-prose text-base leading-relaxed text-ink-soft text-pretty">
              {paragraph}
            </p>
          ))}
          <PillLink href="/events" variant="secondary" className="mt-6">
            {t.landing.eventsAll}
            <ArrowRight className="size-4" aria-hidden="true" />
          </PillLink>
        </Reveal>
      </div>
    </section>
  )
}

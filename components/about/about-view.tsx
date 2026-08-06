'use client'

import { ArrowRight } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { Reveal } from '@/components/reveal'

export function AboutView() {
  const { t } = useLocale()

  return (
    <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal className="mx-auto max-w-2xl">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {t.about.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft text-pretty md:text-xl">
          {t.about.lead}
        </p>
      </Reveal>

      <Reveal className="relative mt-10 aspect-[16/9] overflow-hidden rounded-3xl bg-surface-alt md:mt-14">
        <img
          src="/images/about-space.webp"
          alt="Затишний куточок арт-центру Плай Піч із книжками та роботами на стінах"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </Reveal>

      <Reveal className="mx-auto mt-10 flex max-w-2xl flex-col gap-5 md:mt-14">
        <p className="text-base leading-relaxed text-ink-soft text-pretty">{t.about.body1}</p>
        <p className="text-base leading-relaxed text-ink-soft text-pretty">{t.about.body2}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <PillLink href="/artists">
            {t.about.ctaArtists}
            <ArrowRight className="size-4" aria-hidden="true" />
          </PillLink>
          <PillLink href="/events" variant="secondary">
            {t.about.ctaEvents}
          </PillLink>
        </div>
      </Reveal>
    </main>
  )
}

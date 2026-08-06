'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'

export function Hero() {
  const { t } = useLocale()
  const reduced = useReducedMotion()

  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-16 md:pb-24">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.03em] text-ink text-balance md:text-[4.5rem]">
            {t.landing.heroTitle}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft text-pretty md:mt-6 md:text-lg">
            {t.landing.heroLead}
          </p>
          <div className="mt-7 flex flex-wrap gap-3 md:mt-8">
            <PillLink href="/shop" size="hero">
              {t.landing.heroCtaShop}
              <ArrowRight className="size-4" aria-hidden="true" />
            </PillLink>
            <PillLink href="/events" size="hero" variant="secondary">
              {t.landing.heroCtaEvents}
            </PillLink>
          </div>
        </motion.div>

        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-surface-alt md:aspect-[5/6]"
        >
          <motion.div
            className="absolute inset-0"
            animate={reduced ? undefined : { scale: [1, 1.05] }}
            transition={{ duration: 24, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
          >
            <Image
              src="/images/hero-space.png"
              alt="Виставкова зала арт-центру Плай Піч із картинами на білих стінах"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

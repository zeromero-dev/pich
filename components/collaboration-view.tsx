'use client'

import { ArrowRight, Mail } from 'lucide-react'
import { CONTACTS } from '@/lib/contacts'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { Reveal } from '@/components/reveal'
import { InstagramIcon } from '@/components/footer'

const APPLICATION_FORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSe7xIA2MXdiSKVmJOR7gqA91c3H7jY2CtdZZSohL82H0PyHCQ/viewform'

const contactLink = 'underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink'

export function CollaborationView() {
  const { t } = useLocale()
  const c = t.collaboration

  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <Reveal>
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
          {c.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft text-pretty md:text-xl">{c.lead}</p>
      </Reveal>

      <Reveal className="mt-12 border-t border-hairline pt-10">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{c.sellTitle}</h2>
        {c.sellBody.map((p) => (
          <p key={p} className="mt-4 text-base leading-relaxed text-ink-soft text-pretty">{p}</p>
        ))}
        <PillLink href={APPLICATION_FORM} target="_blank" rel="noreferrer" className="mt-6">
          {c.sellCta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </PillLink>
      </Reveal>

      <Reveal className="mt-12 border-t border-hairline pt-10">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{c.inviteTitle}</h2>
        {c.inviteBody.map((p) => (
          <p key={p} className="mt-4 text-base leading-relaxed text-ink-soft text-pretty">{p}</p>
        ))}
        <p className="mt-6 text-sm font-semibold text-ink">{c.contactLabel}</p>
        <ul className="mt-3 flex flex-col gap-2 text-base text-ink">
          <li className="inline-flex flex-wrap items-center gap-2">
            <Mail className="size-4 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />
            <span className="text-ink-soft">{c.emailLabel}</span>
            <a href={`mailto:${CONTACTS.email}`} className={contactLink}>{CONTACTS.email}</a>
          </li>
          <li className="inline-flex flex-wrap items-center gap-2">
            <InstagramIcon className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="text-ink-soft">{c.instagramLabel}</span>
            <a href={CONTACTS.instagramUrl} target="_blank" rel="noreferrer" className={contactLink}>
              {CONTACTS.instagramHandle}
            </a>
          </li>
        </ul>
      </Reveal>
    </main>
  )
}

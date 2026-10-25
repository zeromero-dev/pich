import { CONTACTS } from '@/lib/contacts'
import type { InfoPage } from '@/lib/info-pages'

export function InfoPageView({ page }: { page: InfoPage }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
        {page.title}
      </h1>
      <div className="mt-8 flex flex-col gap-8">
        {page.sections.map((section, index) => (
          <section key={section.heading ?? index}>
            {section.heading && (
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">{section.heading}</h2>
            )}
            {section.paragraphs.map((p) => (
              <p key={p} className="mt-3 text-base leading-relaxed whitespace-pre-line text-ink-soft text-pretty">
                {p}
              </p>
            ))}
          </section>
        ))}
        {page.placeholder && (
          <p className="text-base text-ink-soft">
            <a href={`mailto:${CONTACTS.email}`} className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
              {CONTACTS.email}
            </a>
          </p>
        )}
      </div>
    </main>
  )
}

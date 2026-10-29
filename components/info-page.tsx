import { CONTACTS } from '@/lib/contacts'
import type { InfoPage } from '@/lib/info-pages'

function EmailLink() {
  return (
    <a href={`mailto:${CONTACTS.email}`} className="text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
      {CONTACTS.email}
    </a>
  )
}

function withEmailLink(text: string) {
  const [before, ...rest] = text.split(CONTACTS.email)
  if (rest.length === 0) return text
  return (
    <>
      {before}
      <EmailLink />
      {rest.join(CONTACTS.email)}
    </>
  )
}

export function InfoPageView({ page }: { page: InfoPage }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 md:px-6 md:pt-14 md:pb-24">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink text-balance md:text-5xl">
        {page.title}
      </h1>
      <div className="mt-8 flex flex-col gap-8">
        {page.sections.map((section) => (
          <section key={section.heading ?? String(section.paragraphs[0])}>
            {section.heading && (
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">{section.heading}</h2>
            )}
            {section.paragraphs.map((p) =>
              typeof p === 'string' ? (
                <p key={p} className="mt-3 text-base leading-relaxed whitespace-pre-line text-ink-soft text-pretty">
                  {withEmailLink(p)}
                </p>
              ) : (
                <ul key={p[0]} className="mt-3 flex list-disc flex-col gap-1 pl-5 text-base leading-relaxed text-ink-soft marker:text-ink-soft/60">
                  {p.map((item) => (
                    <li key={item} className="text-pretty">{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
        {page.placeholder && (
          <p className="text-base text-ink-soft">
            <EmailLink />
          </p>
        )}
      </div>
    </main>
  )
}

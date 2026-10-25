# Navigation, Footer, Content Pages & Copy: Implementation Plan (P5)

> Work through the tasks in order. Each task ends with a verify step and a commit. Tick `- [ ]` → `- [x]` as you go.

**Goal:** A Співпраця page and menu item, menu order Крамничка → Митці → Події → Про нас → Співпраця, footer links to Доставка та оплата / Обмін та повернення / Політика конфіденційності (placeholder text for now), and the brief's copy for the hero, Про нас and Митці.

**Architecture:** One exported `NAV` list in `components/header.tsx` feeds the header (desktop + mobile) and the footer. Unconfirmed contact data lives in one file, `lib/contacts.ts`, marked `PLACEHOLDER`. The three informational pages are single-language repo content in `lib/info-pages.ts` (the same content policy as CRM text, see `.claude/docs/domain/i18n.md`), rendered by one server component. While a page is still placeholder text it is `noindex` and left out of the sitemap.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, lucide-react.

**Spec:** `task/TASK_UK.md` («Структура», «Співпраця», «Про нас», «Митці», hero block). English: `task/TASK.md` §1, §7. Decisions: overview D1, D3, D4, A1, A2, A10.

## Global Constraints

- **UA copy is verbatim from `task/TASK_UK.md`** and is already in this plan, including its typographic apostrophe `’` (U+2019, e.g. «об’єднання», «кав’ярня»). Don't "fix" it to `ʼ`. The source's markdown escape `25\.` is the text «25.». EN copy is from `task/TASK.md` §7 (default A1).
- **Placeholders** carry the literal token `PLACEHOLDER` in a code comment, so `grep -rn PLACEHOLDER app components lib` lists every one (overview §4). Never present placeholder legal text as final: the pages say the information is being prepared.
- **Links:** the Google Form URL is from the brief (Task 1 checks that it opens). The Instagram profile URL is a placeholder (D4).
- Tasks are ordered so no commit links to a page that doesn't exist yet: pages first, then menu/footer links.
- Verify every task with: `npx react-doctor@latest` → `npm run lint` → `npm run build`, plus checks at 375/768/1024/1280 px.

---

### Task 1: Contacts file + Collaboration page `/collaboration`

**Files:**
- Create: `lib/contacts.ts`
- Create: `components/collaboration-view.tsx`
- Create: `app/collaboration/page.tsx`
- Modify: `lib/i18n.ts` (new `collaboration` block, both locales)
- Modify: `app/sitemap.ts` (add `/collaboration`)

**Interfaces:**
- Produces: `CONTACTS: { email: string; instagramHandle: string; instagramUrl: string }`. Route `/collaboration` (default A10), consumed by `NAV` in Task 2.

- [ ] **Step 1: Create `lib/contacts.ts`**

```ts
/* Contact details the owners have not confirmed yet (overview §4). Every value
   marked PLACEHOLDER must be checked before launch. */
export const CONTACTS = {
  // PLACEHOLDER: address from the client brief; the footer still shows hello@plaipich.art.
  email: 'art.store.pich@gmail.com',
  instagramHandle: '@pich.prostir',
  // PLACEHOLDER: profile URL derived from the handle — the brief linked a single post.
  instagramUrl: 'https://www.instagram.com/pich.prostir/',
} as const
```

- [ ] **Step 2: i18n.** Add a `collaboration` block after `about` in both dictionaries. uk (verbatim from `task/TASK_UK.md` «Співпраця»):

```ts
    collaboration: {
      title: 'Співпраця',
      lead: 'Мистецька крамничка ПІЧ відкрита до знайомств із новими авторами та спільних проєктів.',
      sellTitle: 'Ваші роботи у крамничці',
      sellBody: [
        'Запрошуємо митців, майстрів і авторські майстерні запропонувати свої роботи для продажу в ПІЧ та нашій онлайн-крамничці.',
        'Розкажіть трохи про себе й те, що створюєте. Додайте фотографії робіт або посилання на портфоліо, сайт чи сторінку в соцмережах. Ми розглянемо заявку й обговоримо можливість та умови співпраці.',
      ],
      sellCta: 'Залишити заявку',
      inviteTitle: 'Запросити крамничку',
      inviteBody: [
        'Ми також відкриті до участі в ярмарках, виставках та інших подіях, де можна представити роботи наших авторів і познайомитися з новою аудиторією.',
        'Якщо хочете запросити крамничку ПІЧ або маєте ідею спільного проєкту — напишіть нам. Розкажіть про формат, місце, дати й умови участі.',
      ],
      contactLabel: 'Запропонувати співпрацю:',
      emailLabel: 'імейл:',
      instagramLabel: 'напишіть у дірект:',
    },
```

en (from `task/TASK.md` §7.2):

```ts
    collaboration: {
      title: 'Collaboration',
      lead: 'PICH Art Store is open to meeting new creators and working on collaborative projects.',
      sellTitle: 'Your Work in Our Store',
      sellBody: [
        'We invite artists, craftspeople, and independent studios to offer their work for sale at PICH and in our online store.',
        'Tell us a little about yourself and what you create. Add photos of your work or links to your portfolio, website, or social media page. We’ll review your application and discuss possible terms of collaboration.',
      ],
      sellCta: 'Submit an Application',
      inviteTitle: 'Invite the Store',
      inviteBody: [
        'We’re also open to joining fairs, exhibitions, and other events where we can present our artists’ work and connect with new audiences.',
        'If you’d like to invite PICH Art Store or have an idea for a joint project, write to us. Tell us about the format, venue, dates, and participation terms.',
      ],
      contactLabel: 'Propose a Collaboration:',
      emailLabel: 'Email:',
      instagramLabel: 'Instagram:',
    },
```

(Both locales must have two paragraphs per `…Body`, because `DeepString` keeps `as const` tuples. If the build rejects arrays, split them into `sellBody1`/`sellBody2` etc.)

- [ ] **Step 3: Check the form link.**
Run: `curl -sIL "https://docs.google.com/forms/d/e/1FAIpQLSe7xIA2MXdiSKVmJOR7gqA91c3H7jY2CtdZZSohL82H0PyHCQ/viewform" | grep -i "^HTTP"`
Expected: the last line is `HTTP/2 200`. Otherwise stop and report: the brief's form link is broken.

- [ ] **Step 4: Create `components/collaboration-view.tsx`**

```tsx
'use client'

import { ArrowRight, Mail } from 'lucide-react'
import { CONTACTS } from '@/lib/contacts'
import { useLocale } from '@/components/providers'
import { PillLink } from '@/components/pill-button'
import { Reveal } from '@/components/reveal'

const APPLICATION_FORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSe7xIA2MXdiSKVmJOR7gqA91c3H7jY2CtdZZSohL82H0PyHCQ/viewform'

/* lucide-react 1.x has no brand icons; same glyph as the footer's. */
function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

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
```

(The email stays readable as text: `mailto:` doesn't work in every context.)

- [ ] **Step 5: Create `app/collaboration/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { dictionaries } from '@/lib/i18n'
import { CollaborationView } from '@/components/collaboration-view'

export const metadata: Metadata = {
  title: dictionaries.uk.collaboration.title,
  description: dictionaries.uk.collaboration.lead,
}

export default function CollaborationPage() {
  return <CollaborationView />
}
```

- [ ] **Step 6: Sitemap.** Add `'/collaboration'` to `staticRoutes` in `app/sitemap.ts`.

- [ ] **Step 7: Verify.** Open `/collaboration` (not linked from the menu yet) at 375 and 1280 px. Headings go h1 → h2 → h2. «Залишити заявку» opens the Google Form in a new tab. The email reads as text and its link opens the mail app. «@pich.prostir» opens Instagram in a new tab. The EN locale shows the English block. `grep -rn PLACEHOLDER lib` lists the two `lib/contacts.ts` lines.

- [ ] **Step 8: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add lib/contacts.ts components/collaboration-view.tsx app/collaboration lib/i18n.ts app/sitemap.ts
git commit -m "feat: collaboration page (Співпраця)"
```

---

### Task 2: Menu order + Співпраця, one shared nav list

**Files:**
- Modify: `components/header.tsx`
- Modify: `components/footer.tsx`
- Modify: `lib/i18n.ts` (`nav.collaboration`)
- Modify: `.claude/docs/ui-ux-guidelines.md` §5 Header

**Interfaces:**
- Consumes: `/collaboration` (Task 1), `CONTACTS` (Task 1).
- Produces: `export const NAV` from `components/header.tsx`. Items have the shape `{ href: string; key: 'shop' | 'artists' | 'events' | 'about' | 'collaboration' }`.

- [ ] **Step 1: i18n.** `nav`: uk `collaboration: 'Співпраця',` en `collaboration: 'Collaboration',`.

- [ ] **Step 2: Shared list.** In `components/header.tsx`, below `LOCALE_OPTIONS`:

```tsx
/* Order is the client's (brief «Структура»); the footer reuses this list. */
export const NAV = [
  { href: '/shop', key: 'shop' },
  { href: '/artists', key: 'artists' },
  { href: '/events', key: 'events' },
  { href: '/about', key: 'about' },
  { href: '/collaboration', key: 'collaboration' },
] as const
```

In `Header`, replace the `const nav = [ … ]` array with:

```tsx
  const nav = NAV.map((item) => ({ href: item.href, label: t.nav[item.key] }))
```

- [ ] **Step 3: Footer.** In `components/footer.tsx`: `import { NAV } from '@/components/header'` and `import { CONTACTS } from '@/lib/contacts'`. Replace its `const nav = [ … ]` with the same one-liner. In `SOCIALS`, change the Instagram `href: 'https://instagram.com'` to `href: CONTACTS.instagramUrl`. The Telegram entry stays as is (still a placeholder from before this brief. Add `// PLACEHOLDER: no Telegram URL supplied` above it so the launch grep finds it).

- [ ] **Step 4: Breakpoint check.** In `npm run dev`, look at the desktop nav at **768 px** and **1024 px**, in both locales (EN labels are longer). If the five links + locale switch + cart wrap or overlap at 768 px, move the desktop/mobile switch from `md` to `lg` in `components/header.tsx`: the desktop `<nav>` `hidden md:flex` → `hidden lg:flex`, the `<div className="hidden md:block">` around `LocaleSwitch` → `hidden lg:block`, the burger button `md:hidden` → `lg:hidden`, and the menu overlay `md:hidden` → `lg:hidden`.
Expected afterwards: no wrap or overlap at 768/1024/1280. At 375 px, the mobile menu lists the five items in order and closes on link tap and on Esc. The active state highlights the current page, `/collaboration` included. The footer «Навігація» shows the same order.

- [ ] **Step 5: Docs.** `.claude/docs/ui-ux-guidelines.md` §5 Header: "nav (Крамничка / Митці / Події / Про нас / Співпраця, from `NAV` in `components/header.tsx`)", plus the breakpoint if it changed.

- [ ] **Step 6: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add components/header.tsx components/footer.tsx lib/i18n.ts .claude/docs/ui-ux-guidelines.md
git commit -m "feat(nav): client menu order with Співпраця, shared header/footer list"
```

---

### Task 3: Informational pages with placeholder text + footer links

**Files:**
- Create: `lib/info-pages.ts`
- Create: `components/info-page.tsx`
- Create: `app/delivery/page.tsx`, `app/returns/page.tsx`, `app/privacy/page.tsx`
- Modify: `components/footer.tsx`
- Modify: `lib/i18n.ts` (`footer.customers`, `footer.delivery`, `footer.returns`, `footer.privacy`)
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `CONTACTS.email`.
- Produces: `InfoPage = { title: string; description: string; placeholder: boolean; sections: { heading?: string; paragraphs: string[] }[] }`. `infoPages: Record<'delivery' | 'returns' | 'privacy', InfoPage>`. `InfoPageView({ page: InfoPage })`.

- [ ] **Step 1: Create `lib/info-pages.ts`**

```ts
/**
 * Owner-supplied informational/legal text, single-language (i18n.md content
 * policy). We never write this wording ourselves — the brief forbids it.
 */
export type InfoPage = {
  title: string
  description: string
  /** true = owner text not supplied yet: page is noindex and left out of the sitemap. */
  placeholder: boolean
  sections: { heading?: string; paragraphs: string[] }[]
}

// PLACEHOLDER: shown until the owners send the real text for each page.
const PENDING = [{ paragraphs: ['Інформація на цій сторінці готується.'] }]

export const infoPages: Record<'delivery' | 'returns' | 'privacy', InfoPage> = {
  delivery: {
    title: 'Доставка та оплата',
    description: 'Доставка та оплата у мистецькій крамничці ПІЧ.',
    placeholder: true,
    sections: PENDING,
  },
  returns: {
    title: 'Обмін та повернення',
    description: 'Обмін та повернення у мистецькій крамничці ПІЧ.',
    placeholder: true,
    sections: PENDING,
  },
  privacy: {
    title: 'Політика конфіденційності',
    description: 'Політика конфіденційності мистецької крамнички ПІЧ.',
    placeholder: true,
    sections: PENDING,
  },
}
```

(Titles are verbatim from the brief («Політику конфіденційності» in the brief's list is the accusative case, so the page title uses the nominative). When the owners send text: replace `sections` with their headings and paragraphs character for character and set `placeholder: false`. Checkout already collects name, email, phone and address, so the privacy text is the one to chase first.)

- [ ] **Step 2: Create `components/info-page.tsx`** (server component)

```tsx
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
```

- [ ] **Step 3: Three routes.** `app/delivery/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { infoPages } from '@/lib/info-pages'
import { InfoPageView } from '@/components/info-page'

const page = infoPages.delivery

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  ...(page.placeholder ? { robots: { index: false } } : {}),
}

export default function DeliveryPage() {
  return <InfoPageView page={page} />
}
```

`app/returns/page.tsx`: identical with `infoPages.returns` and `ReturnsPage`. `app/privacy/page.tsx`: `infoPages.privacy` and `PrivacyPage`.

- [ ] **Step 4: i18n.** `footer`: uk `customers: 'Покупцям', delivery: 'Доставка та оплата', returns: 'Обмін та повернення', privacy: 'Політика конфіденційності',` en `customers: 'Customers', delivery: 'Delivery & payment', returns: 'Exchanges & returns', privacy: 'Privacy policy',` («Покупцям» is our column heading. The brief only lists the links.)

- [ ] **Step 5: Footer links.** In `components/footer.tsx`, inside the «Навігація» column, after its `</ul>`:

```tsx
            <h3 className="mt-6 text-sm font-semibold text-ink">{t.footer.customers}</h3>
            <ul className="mt-3 space-y-2">
              {(
                [
                  { href: '/delivery', label: t.footer.delivery },
                  { href: '/returns', label: t.footer.returns },
                  { href: '/privacy', label: t.footer.privacy },
                ] as const
              ).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
```

- [ ] **Step 6: Sitemap.** In `app/sitemap.ts`: `import { infoPages } from '@/lib/info-pages'`, and append to `staticRoutes`:

```ts
    ...Object.entries(infoPages)
      .filter(([, page]) => !page.placeholder)
      .map(([path]) => ({ url: `${WEBSITE_URL}/${path}` })),
```

(While all three are placeholders, none are listed. If `staticRoutes` is built from a `.map`, append this as a separate array in the return value instead.)

- [ ] **Step 7: Verify.** All three footer links open their page. Each shows the title, «Інформація на цій сторінці готується.» and the email. `curl -s localhost:3000/privacy | grep -o '<meta name="robots"[^>]*>'` prints a `noindex` tag. `/sitemap.xml` has none of the three. Footer columns align at 768/1280, and at 375 px the columns stack.

- [ ] **Step 8: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add lib/info-pages.ts components/info-page.tsx app/delivery app/returns app/privacy components/footer.tsx lib/i18n.ts app/sitemap.ts
git commit -m "feat: delivery, returns, privacy pages (placeholder text) with footer links"
```

---

### Task 4: Brief copy for hero, Про нас, Митці

**Files:**
- Modify: `lib/i18n.ts` (`landing.heroTitle`, `landing.heroLead`, `landing.heroCtaShop`; remove `landing.heroCtaEvents`. `about.lead`, `about.body1`, `about.body2`, `about.artistsLead`)
- Modify: `components/landing/hero.tsx` (one CTA)

- [ ] **Step 1: Hero copy.** uk (verbatim, `task/TASK_UK.md` hero block):

```ts
      heroTitle: 'Мистецька крамничка ПІЧ',
      heroLead:
        'Кераміка, прикраси, картини й інші авторські речі від майстрів з усієї України. Ми зібрали їх у ПІЧ у Вінниці, а тепер знайомимо з ними й онлайн. Роздивляйтеся роботи, знайомтеся з авторами та обирайте для себе або на подарунок.',
      heroCtaShop: 'До крамнички',
```

en:

```ts
      heroTitle: 'PICH Art Store',
      heroLead:
        'Ceramics, jewelry, paintings, and other original creations by makers from all over Ukraine. We’ve brought them together at PICH in Vinnytsia, and now we’re introducing them to you online. Explore the works, get to know their creators, and find something for yourself or as a gift.',
      heroCtaShop: 'Go to the Store',
```

(The brief's «→» is the existing `ArrowRight` icon, so it stays out of the string. The logo, `<title>` template and JSON-LD keep «Плай Піч», per default A2.)

- [ ] **Step 2: One CTA.** The brief's hero has one button. In `components/landing/hero.tsx`, delete the second `<PillLink href="/events" size="hero" variant="secondary">…</PillLink>`. Then delete `landing.heroCtaEvents` from both locales: `grep -rn heroCtaEvents app components lib` should print nothing.

- [ ] **Step 3: Про нас.** `AboutView` renders `lead` (large) + `body1` + `body2`, which map one-to-one onto the brief's three paragraphs. No component change. uk (verbatim, «Про нас»):

```ts
      lead: 'Мистецька крамничка ПІЧ — це роботи понад 50 авторів з різних куточків України, зібрані у Вінниці. У нас можна обрати кераміку й посуд, прикраси, одяг та аксесуари, картини, книги й листівки. Роздивитися їх можна онлайн або наживо у крамничці на Сковороди, 25.',
      body1:
        'Ми хочемо знайомити вас і з роботами, і з людьми, які їх створюють. Тому на сайті розповідаємо про наших авторів, їхні матеріали, техніки та ідеї.',
      body2:
        'Крамничка — частина культурного простору ПІЧ, який громадська організація «Мистецьке об’єднання PLAI» створила у 2020 році, під час пандемії. Тут митці різних напрямків зустрічаються, співпрацюють і реалізують спільні проєкти. У просторі відбуваються культурні події, освітні та медіапроєкти, а поруч із крамничкою працює спешелті-кав’ярня.',
```

en (`task/TASK.md` §7.3):

```ts
      lead: 'PICH Art Store brings together work by more than 50 creators from across Ukraine, all in Vinnytsia. Here you’ll find ceramics and tableware, jewelry, clothing and accessories, paintings, books, and postcards. You can explore them online or visit our store in person at 25 Skovorody Street.',
      body1:
        'We want to introduce you not only to the works but also to the people who make them. That’s why our website shares stories about our artists, their materials, techniques, and ideas.',
      body2:
        'The store is part of the PICH cultural space, founded in 2020 during the pandemic by the NGO “PLAI Art Association.” Artists from different fields meet, collaborate, and develop joint projects here. The space hosts cultural events, educational and media projects, and a specialty coffee shop operates next to the store.',
```

- [ ] **Step 4: Митці intro.** `about.artistsLead`. uk (verbatim, «Митці»): `'Знайомтеся з авторами, чиї роботи представлені у мистецькій крамничці ПІЧ. Дізнавайтеся, з чим вони працюють, що їх надихає, та обирайте їхні вироби.'` en: `'Meet the creators whose works are featured at PICH Art Store. Discover the materials they use, what inspires them, and choose their creations.'`

- [ ] **Step 5: Verbatim check.** Every UA string added by this plan must occur in the source unchanged:

```bash
for s in 'Мистецька крамничка ПІЧ відкрита до знайомств' 'спешелті-кав’ярня' 'Сковороди, 25' 'обирайте їхні вироби' 'обирайте для себе або на подарунок' 'умови участі' 'Залишити заявку' 'Запросити крамничку' 'напишіть у дірект'; do printf '%s: ' "$s"; grep -cF "$s" task/TASK_UK.md; done
```

Expected: every count ≥ 1. A `0` means an apostrophe or dash was altered while copying, so re-copy from the source.

- [ ] **Step 6: Visual check.** `/`: one hero button, and the title «Мистецька крамничка ПІЧ» wraps cleanly at 375 px (`text-balance`). `/about`: the three paragraphs in order. `/artists`: the new lead. Both locales.

- [ ] **Step 7: react-doctor, lint, build, commit**

```bash
npx react-doctor@latest && npm run lint && npm run build
git add lib/i18n.ts components/landing/hero.tsx
git commit -m "content: hero, about and artists copy from client brief"
```

- [ ] **Step 8: Docs.** `CLAUDE.md`: add `/collaboration`, `/delivery`, `/returns`, `/privacy` to the `app/` line of the architecture tree. In "Current state", note: "Співпраця page built. Delivery/returns/privacy pages exist with placeholder text (`lib/info-pages.ts`, `noindex` until filled). Unconfirmed contacts in `lib/contacts.ts`. `grep -rn PLACEHOLDER app components lib` lists what's left." Commit: `git commit -am "docs: content pages and placeholders"` (check `git status` first).

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

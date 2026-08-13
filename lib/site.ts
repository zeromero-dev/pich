const configured = process.env.WEBSITE_URL

// Absolute origin behind metadataBase, the sitemap, JSON-LD and the OG card.
// A wrong value ships dead logo and preview URLs to Google, so a production
// build fails here rather than silently baking in localhost.
if (process.env.NODE_ENV === 'production' && !configured) {
  throw new Error(
    'WEBSITE_URL is not set. It is baked into the sitemap, JSON-LD and social cards at build time.',
  )
}

export const WEBSITE_URL = configured ?? 'http://localhost:3000'

export const BRAND = {
  name: 'Плай Піч',
  tagline: 'Арт-центр і крамничка сучасного українського мистецтва',
  /** Google wants the Organization logo as a raster on a light ground, min 112px. */
  logo: `${WEBSITE_URL}/icon-512.png`,
} as const

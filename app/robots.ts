import type { MetadataRoute } from 'next'
import { WEBSITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/checkout',
    },
    sitemap: `${WEBSITE_URL}/sitemap.xml`,
  }
}

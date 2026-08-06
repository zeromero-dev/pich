import type { MetadataRoute } from 'next'
import { products } from '@/lib/data'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/shop', '/events', '/about', '/artists'].map((path) => ({
    url: `${SITE_URL}${path}`,
  }))
  const productRoutes = products.map((p) => ({
    url: `${SITE_URL}/shop/${p.slug}`,
  }))
  return [...staticRoutes, ...productRoutes]
}

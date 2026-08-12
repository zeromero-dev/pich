import type { MetadataRoute } from 'next'
import { artistsOf, getCatalog } from '@/lib/hugeprofit'
import { SITE_URL } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCatalog()
  const staticRoutes = ['', '/shop', '/events', '/about', '/artists'].map((path) => ({
    url: `${SITE_URL}${path}`,
  }))
  const productRoutes = products.map((p) => ({
    url: `${SITE_URL}/shop/${p.slug}`,
  }))
  const artistRoutes = artistsOf(products).map((a) => ({
    url: `${SITE_URL}/artists/${a.slug}`,
  }))
  return [...staticRoutes, ...productRoutes, ...artistRoutes]
}

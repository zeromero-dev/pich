import type { MetadataRoute } from 'next'
import { artistsOf, getCatalog } from '@/lib/hugeprofit'
import { WEBSITE_URL } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCatalog()
  const staticRoutes = ['', '/shop', '/events', '/about', '/artists'].map((path) => ({
    url: `${WEBSITE_URL}${path}`,
  }))
  const productRoutes = products.map((p) => ({
    url: `${WEBSITE_URL}/shop/${p.slug}`,
  }))
  const artistRoutes = artistsOf(products).map((a) => ({
    url: `${WEBSITE_URL}/artists/${a.slug}`,
  }))
  return [...staticRoutes, ...productRoutes, ...artistRoutes]
}

import type { MetadataRoute } from 'next'
import { artistsOf, getCatalog } from '@/lib/hugeprofit'
import { getEvents } from '@/lib/events'
import { infoPages } from '@/lib/info-pages'
import { WEBSITE_URL } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCatalog()
  const staticRoutes = ['', '/shop', '/events', '/about', '/artists', '/collaboration'].map((path) => ({
    url: `${WEBSITE_URL}${path}`,
  }))
  const productRoutes = products.map((p) => ({
    url: `${WEBSITE_URL}/shop/${p.slug}`,
  }))
  const artistRoutes = artistsOf(products).map((a) => ({
    url: `${WEBSITE_URL}/artists/${a.slug}`,
  }))
  const eventRoutes = (await getEvents()).map((e) => ({ url: `${WEBSITE_URL}/events/${e.slug}` }))
  const infoRoutes = Object.entries(infoPages)
    .filter(([, page]) => !page.placeholder)
    .map(([path]) => ({ url: `${WEBSITE_URL}/${path}` }))
  return [...staticRoutes, ...infoRoutes, ...productRoutes, ...artistRoutes, ...eventRoutes]
}

import type { Metadata } from 'next'
import { serializeJsonLd } from '@/lib/json-ld'
import { notFound, permanentRedirect } from 'next/navigation'
import { getCatalog, getProductBySlug, worksByArtistSlug } from '@/lib/hugeprofit'
import { getArtistProfiles, withArtistNames } from '@/lib/artists'
import { WEBSITE_URL } from '@/lib/site'
import { ProductDetail } from '@/components/shop/product-detail'

export async function generateStaticParams() {
  const products = await getCatalog()
  return products.map((p) => ({ slug: p.slug }))
}

async function findProduct(slug: string) {
  const [product, profiles] = await Promise.all([getProductBySlug(slug), getArtistProfiles()])
  return product ? { product: withArtistNames([product], profiles)[0], profiles } : null
}

function heading(name: string, artist: string | null): string {
  return artist ? `${name} — ${artist}` : name
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = (await findProduct(slug))?.product
  if (!product) return { title: 'Робота не знайдена' }

  const title = heading(product.name, product.artist)
  return {
    title,
    openGraph: {
      title,
      images: product.images[0] ? [product.images[0]] : undefined,
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const found = await findProduct(slug)
  if (!found) notFound()
  const { product, profiles } = found
  // Old name + id addresses (/shop/chashka-9054735) are indexed and in carts: send them to /shop/<id>.
  if (slug !== product.slug) permanentRedirect(`/shop/${product.slug}`)

  const related = product.artistSlug
    ? withArtistNames(
        worksByArtistSlug(await getCatalog(), product.artistSlug)
          .filter((p) => p.id !== product.id)
          .slice(0, 4),
        profiles,
      )
    : []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images[0],
    brand: product.artist ? { '@type': 'Person', name: product.artist } : undefined,
    offers: {
      '@type': 'Offer',
      url: `${WEBSITE_URL}/shop/${product.slug}`,
      price: product.price,
      priceCurrency: 'UAH',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ProductDetail product={product} related={related} />
    </>
  )
}

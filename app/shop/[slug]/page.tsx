import type { Metadata } from 'next'
import { serializeJsonLd } from '@/lib/json-ld'
import { notFound } from 'next/navigation'
import { getCatalog, getProductBySlug, worksByArtistSlug } from '@/lib/hugeprofit'
import { WEBSITE_URL } from '@/lib/site'
import { ProductDetail } from '@/components/shop/product-detail'

export async function generateStaticParams() {
  const products = await getCatalog()
  return products.map((p) => ({ slug: p.slug }))
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
  const product = await getProductBySlug(slug)
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
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const related = product.artistSlug
    ? worksByArtistSlug(await getCatalog(), product.artistSlug)
        .filter((p) => p.id !== product.id)
        .slice(0, 4)
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

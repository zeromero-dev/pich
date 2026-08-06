import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProduct, products } from '@/lib/data'
import { ProductDetail } from '@/components/shop/product-detail'

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = getProduct(slug)
  if (!product) return { title: 'Робота не знайдена — Плай Піч' }
  return {
    title: `${product.name} — ${product.artist} | Плай Піч`,
    description: product.description,
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = getProduct(slug)
  if (!product) notFound()
  return <ProductDetail product={product} />
}

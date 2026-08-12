'use client'

import type { Product } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { ProductCard } from '@/components/product-card'
import { SectionHeading } from '@/components/section-heading'
import { StaggerGroup, StaggerItem } from '@/components/reveal'

export function FeaturedWorks({ products }: { products: Product[] }) {
  const { t } = useLocale()
  const featured = products.slice(0, 8)

  return (
    <section className="bg-surface-alt py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          title={t.landing.featuredTitle}
          href="/shop"
          linkLabel={t.landing.featuredAll}
        />
        <StaggerGroup className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {featured.map((product) => (
            <StaggerItem key={product.id}>
              <ProductCard product={product} />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}

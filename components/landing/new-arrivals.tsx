'use client'

import { ArrowRight } from 'lucide-react'
import type { Product } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { Carousel } from '@/components/carousel'
import { PillLink } from '@/components/pill-button'
import { ProductCard } from '@/components/product-card'

export function NewArrivals({ products }: { products: Product[] }) {
  const { t } = useLocale()
  return (
    <section className="bg-surface-alt py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <Carousel
          title={t.landing.newTitle}
          itemClassName="w-[44%] sm:w-[30%] lg:w-[calc((100%-3rem)/4)]"
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Carousel>
        <div className="mt-8 flex justify-center">
          <PillLink href="/shop" variant="secondary">
            {t.landing.featuredAll}
            <ArrowRight className="size-4" aria-hidden="true" />
          </PillLink>
        </div>
      </div>
    </section>
  )
}

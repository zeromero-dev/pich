'use client'

import Link from 'next/link'
import type { CategoryTile } from '@/lib/data'
import { useLocale } from '@/components/providers'
import { Carousel } from '@/components/carousel'

/* Tiles crop with object-cover: a mood image, not the work itself (the
   no-crop question in brief §3.2 is about product cards). */
export function CategoriesCarousel({ categories }: { categories: CategoryTile[] }) {
  const { t } = useLocale()
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Carousel
        title={t.landing.categoriesTitle}
        itemClassName="w-[42%] sm:w-[30%] lg:w-[calc((100%-4rem)/5)]"
      >
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/shop?category=${category.slug}`}
            className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-surface-alt"
          >
            <img
              src={category.cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            />
            <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-ink/60 via-ink/10 to-transparent" />
            <span className="absolute inset-x-3 bottom-3 text-base font-semibold leading-snug text-surface text-pretty">
              {category.label}
            </span>
          </Link>
        ))}
      </Carousel>
    </section>
  )
}

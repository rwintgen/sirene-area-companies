import type { MetadataRoute } from 'next'

const SITE_URL = 'https://publicdatamaps.com'
const LOCALES = ['en', 'fr']
const PAGES = [
  { slug: '',           changeFrequency: 'weekly'  as const, priority: 1.0 },
  { slug: '/features',  changeFrequency: 'monthly' as const, priority: 0.9 },
  { slug: '/pricing',   changeFrequency: 'weekly'  as const, priority: 0.9 },
  { slug: '/use-cases', changeFrequency: 'monthly' as const, priority: 0.8 },
  { slug: '/enterprise',changeFrequency: 'monthly' as const, priority: 0.8 },
  { slug: '/resources', changeFrequency: 'monthly' as const, priority: 0.7 },
  { slug: '/contact',   changeFrequency: 'yearly'  as const, priority: 0.5 },
  { slug: '/privacy',   changeFrequency: 'yearly'  as const, priority: 0.3 },
  { slug: '/terms',     changeFrequency: 'yearly'  as const, priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap(({ slug, changeFrequency, priority }) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${slug}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l, `${SITE_URL}/${l}${slug}`])
        ),
      },
    }))
  )
}

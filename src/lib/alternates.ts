const SITE_URL = 'https://publicdatamaps.com'

/**
 * Returns canonical + hreflang alternates for a marketing page.
 * Pass the current locale and the path without the locale prefix (e.g. '/features').
 * Use '/' for the homepage.
 */
export function pageAlternates(locale: string, path: string) {
  const slug = path === '/' ? '' : path
  return {
    canonical: `${SITE_URL}/${locale}${slug}`,
    languages: {
      en: `${SITE_URL}/en${slug}`,
      fr: `${SITE_URL}/fr${slug}`,
      'x-default': `${SITE_URL}/en${slug}`,
    } as Record<string, string>,
  }
}

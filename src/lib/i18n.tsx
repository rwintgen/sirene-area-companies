'use client'

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export type Locale = 'en' | 'fr'

const LOCALES: Locale[] = ['en', 'fr']

interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {} })

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const setLocale = useCallback((l: Locale) => {
    document.cookie = `site-locale=${l};path=/;max-age=31536000;SameSite=Lax`
    document.documentElement.setAttribute('data-locale', l)
    const segments = pathname.split('/')
    if (LOCALES.includes(segments[1] as Locale)) {
      segments[1] = l
    }
    router.push(segments.join('/'))
  }, [pathname, router])

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

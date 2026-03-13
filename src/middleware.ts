import { NextRequest, NextResponse } from 'next/server'

const LOCALES = ['en', 'fr']
const DEFAULT_LOCALE = 'en'

const MARKETING_PATHS = [
  '/',
  '/features',
  '/use-cases',
  '/resources',
  '/enterprise',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
]

function getLocale(request: NextRequest): string {
  const cookie = request.cookies.get('site-locale')?.value
  if (cookie && LOCALES.includes(cookie)) return cookie

  const acceptLang = request.headers.get('accept-language') || ''
  if (acceptLang.toLowerCase().startsWith('fr')) return 'fr'

  return DEFAULT_LOCALE
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  )
  if (hasLocale) return NextResponse.next()

  if (pathname === '/' || MARKETING_PATHS.some((p) => p !== '/' && pathname === p)) {
    const locale = getLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.png|brand|marketing|app).*)',
  ],
}

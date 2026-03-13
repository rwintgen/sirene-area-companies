import { LocaleProvider, type Locale } from '@/lib/i18n'
import { notFound } from 'next/navigation'

const LOCALES: Locale[] = ['en', 'fr']

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

interface Props {
  children: React.ReactNode
  params: { locale: string }
}

export default function LocaleLayout({ children, params }: Props) {
  if (!LOCALES.includes(params.locale as Locale)) notFound()

  return (
    <LocaleProvider locale={params.locale as Locale}>
      {children}
    </LocaleProvider>
  )
}

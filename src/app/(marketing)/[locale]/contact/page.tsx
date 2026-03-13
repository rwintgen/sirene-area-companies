import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import ContactContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Contact – Public Data Maps',
    description: 'Get in touch with the Public Data Maps team.',
    alternates: pageAlternates(params.locale, '/contact'),
  }
}

export default function ContactPage() {
  return <ContactContent />
}

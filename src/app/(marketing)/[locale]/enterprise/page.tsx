import type { Metadata } from 'next'
import { pageAlternates } from '@/lib/alternates'
import EnterpriseContent from './content'

interface Props { params: { locale: string } }

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: 'Enterprise — Public Data Maps',
    description: 'Unlimited searches, team workspaces, per-seat billing, and priority support for organizations.',
    alternates: pageAlternates(params.locale, '/enterprise'),
  }
}

export default function EnterprisePage() {
  return <EnterpriseContent />
}

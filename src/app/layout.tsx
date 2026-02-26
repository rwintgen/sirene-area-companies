import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Public Data Maps - France',
  description: 'Draw an area on the map and discover every registered company inside it',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} h-full bg-gray-950 text-gray-100`}>
        {children}
      </body>
    </html>
  )
}

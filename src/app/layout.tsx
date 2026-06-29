import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'

import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

const space = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'ConcurseiroPro',
    template: '%s | ConcurseiroPro',
  },
  description: 'Seu painel pessoal de preparacao para concursos publicos.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${space.variable}`}>
      <body>{children}</body>
    </html>
  )
}

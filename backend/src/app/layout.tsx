import type { ReactNode } from 'react'

export const metadata = {
  title: 'Mafia Backend',
  description: 'API server for Mafia Nightfall',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

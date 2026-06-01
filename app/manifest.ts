import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '光 Hikari',
    short_name: 'Hikari',
    description: 'Matyášův osobní life tracker',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#080808',
    theme_color: '#F59E0B',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}

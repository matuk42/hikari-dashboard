import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '光 Hikari',
    short_name: 'Hikari',
    description: 'Matyášův osobní life tracker',
    start_url: '/habits',
    display: 'standalone',
    background_color: '#080808',
    theme_color: '#F59E0B',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}

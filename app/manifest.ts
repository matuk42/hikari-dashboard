import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '光 Hikari',
    short_name: 'Hikari',
    description: 'Matyášův osobní life tracker',
    start_url: '/',
    display: 'standalone',
    background_color: '#080808',
    theme_color: '#F59E0B',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}

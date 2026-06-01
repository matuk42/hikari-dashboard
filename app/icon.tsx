import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 512,
        height: 512,
        background: '#080808',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: 340, color: '#F59E0B' }}>光</span>
    </div>,
    { width: 512, height: 512 }
  )
}

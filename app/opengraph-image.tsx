import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/site'

export const alt = `${BRAND.name} — ${BRAND.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori rasterises <img> but not inline SVG children, so the mark ships as a
// data URI with literal fills — currentColor has nothing to inherit from here.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="400.1 181 399.8 836.8" fill="#111111">
<g fill-opacity=".949"><path d="M400.1 181H799.9V590.3H679.4V282.3H519.9V590.3H400.1Z"/><path d="M400.1 605.8H519.9V756H679.4V605.8H799.9V1017.8H681.3V864.9H400.1Z"/></g>
<g fill-opacity=".8"><path d="M538.4 439.2H658.2V480H617.2V555.4H538.4V514.7H578.7V480H538.4Z"/><path d="M538.4 567.3H575.3V611.2H538.4Z"/><path d="M581.2 567.3H658.2V611.2H581.2Z"/><path d="M538.4 624H658.2V665.4H575.5V700.2H658.2V742.7H538.4Z"/></g>
</svg>`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          background: '#ffffff',
          padding: '0 104px',
        }}
      >
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`}
          width={172}
          height={360}
          alt=""
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: 76,
            borderLeft: '1px solid #11111114',
            paddingLeft: 76,
          }}
        >
          <div style={{ fontSize: 88, color: '#111111', letterSpacing: '-0.03em' }}>
            {BRAND.name}
          </div>
          <div
            style={{
              fontSize: 34,
              color: '#555555',
              marginTop: 24,
              maxWidth: 600,
              lineHeight: 1.35,
            }}
          >
            {BRAND.tagline}
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}

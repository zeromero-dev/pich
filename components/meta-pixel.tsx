'use client'

import { Suspense, useEffect } from 'react'
import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { flushQueue, track } from '@/lib/meta/pixel'

function PageView() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  useEffect(() => {
    window.fbq?.('track', 'PageView')
  }, [pathname, search])
  return null
}

function Flush() {
  useEffect(() => flushQueue(track), [])
  return null
}

// Sibling effects run in order: Script (defines fbq), PageView, then queued events.
export function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixelId)});`}
      </Script>
      <Suspense>
        <PageView />
      </Suspense>
      <Flush />
    </>
  )
}

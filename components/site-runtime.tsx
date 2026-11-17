'use client';
import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
export function SiteRuntime(){
  const pathname=usePathname();
  useEffect(()=>{document.dispatchEvent(new Event('site:pageview'));},[pathname]);
  if(/^\/(admin|orders|api)(\/|$)/.test(pathname))return null;
  return <><Script src="/site-analytics.js" strategy="afterInteractive"/><button type="button" className="site-cookie-settings" data-analytics-settings>Настройки аналитики</button></>;
}

"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { API_URL } from "@/lib/api";

type PublicAnalyticsSettings = {
  googleAnalyticsMeasurementId?: string;
  googleTagManagerContainerId?: string;
};

export function AnalyticsScripts() {
  const [settings, setSettings] = useState<PublicAnalyticsSettings | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/public/analytics-settings`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active) setSettings(payload?.data ?? {});
      })
      .catch(() => {
        if (active) setSettings({});
      });
    return () => {
      active = false;
    };
  }, []);

  const gaId = settings?.googleAnalyticsMeasurementId;
  const gtmId = settings?.googleTagManagerContainerId;

  return (
    <>
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
          <Script id="manualflow-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');
            `}
          </Script>
        </>
      ) : null}
      {gtmId ? (
        <>
          <Script id="manualflow-google-tag-manager" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `}
          </Script>
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
          </noscript>
        </>
      ) : null}
    </>
  );
}

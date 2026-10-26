import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import AutoRefresh from "@/components/AutoRefresh";
import LightRays from "@/components/LightRays";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "SplunkEvents",
  description: "Every scheduled Splunk report in one place, instead of in your inbox.",
};

// Back and forward bring pages out of the browser's caches exactly as they
// were, even for a session that has since ended. Vercel serves pages as
// cacheable, so after signing out, Back could show the previous person's
// reports. This runs before the first paint: such a page is hidden and loaded
// again, so the server decides what to show (the sign-in page, once signed out).
const RELOAD_PAGES_FROM_HISTORY = `(function(){try{
var again=function(){document.documentElement.style.visibility="hidden";location.reload()};
var nav=performance.getEntriesByType("navigation")[0];
if(nav&&nav.type==="back_forward")again();
addEventListener("pageshow",function(e){if(e.persisted)again()});
}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RELOAD_PAGES_FROM_HISTORY }} />
      </head>
      <body
        className={`${fontVariables} min-h-screen antialiased`}
      >
      <a href="#content" className="skip-link">Skip to content</a>
      <Navbar />
      <AutoRefresh />

          <div className="absolute inset-0 top-0 z-[-1] min-h-screen">
              <LightRays
                  raysOrigin="top-center-offset"
                  raysColor="#5dfeca"
                  raysSpeed={0.5}
                  lightSpread={0.9}
                  rayLength={1.4}
                  followMouse={true}
                  mouseInfluence={0.02}
                  noiseAmount={0.0}
                  distortion={0.01}
              />
          </div>

          <main id="content">
            {children}
          </main>
      </body>
    </html>
  );
}

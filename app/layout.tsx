import type { Metadata } from "next";
import { Schibsted_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";
import AutoRefresh from "@/components/AutoRefresh";
import LightRays from "@/components/LightRays";
import Navbar from "@/components/Navbar";

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted-grotesk",
  subsets: ["latin"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SplunkEvents",
  description: "Every scheduled Splunk report in one place, instead of in your inbox.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${schibstedGrotesk.variable} ${martianMono.variable} min-h-screen antialiased`}
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

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

// Geist comes from Vercel's `geist` package (Next 14.2 doesn't ship Geist in
// next/font/google yet). DESIGN-SYSTEM.md §10.3 specified next/font/google —
// reality: Geist via `geist/font/*`, Instrument Serif via next/font/google.
// CSS variables remain --font-geist-sans / --font-geist-mono as §10.1 expects.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus v2",
  description: "AI sales orchestration platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="bg-base text-primary min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

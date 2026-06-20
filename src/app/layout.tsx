import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Redesign typography (m-redesign): IBM Plex Sans for the UI, Source Serif 4 for figures/headings.
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap" });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CapEasy vCFO",
  description: "Internal virtual-CFO / MIS engine for CapEasy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${sourceSerif.variable} h-full antialiased`}>
      {/* Warm-neutral canvas + ink come from the design tokens (globals.css). */}
      <body className="font-sans min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}

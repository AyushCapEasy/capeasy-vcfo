import type { Metadata } from "next";
import { Sora, Public_Sans } from "next/font/google";
import "./globals.css";

// Redesign V2 typography (m-redesign-v2 — "Meridian" handoff): Sora for headings/display,
// Public Sans for body + financial figures (tabular numerals).
const sora = Sora({ variable: "--font-sora", weight: ["400", "500", "600", "700", "800"], subsets: ["latin"], display: "swap" });
const publicSans = Public_Sans({ variable: "--font-public-sans", weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap" });

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
    <html lang="en" className={`${sora.variable} ${publicSans.variable} h-full antialiased`}>
      {/* Navy+emerald canvas: slate body text on the cool --color-canvas; headings/figures are navy. */}
      <body className="font-sans min-h-full flex flex-col bg-canvas text-body">{children}</body>
    </html>
  );
}

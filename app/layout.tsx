import type { Metadata } from "next";
import { Fraunces, Spectral, Space_Mono } from "next/font/google";
import "./globals.css";

// Display: Fraunces — a high-contrast "old-style" serif with optical sizing.
// Gives the oracle/almanac instrument feel for the decision + verdicts.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// Body: Spectral — a screen-tuned serif for the streaming reasoning text.
const spectral = Spectral({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// Machine readout: Space Mono — cost tickers, research steps, session ids.
const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const siteTitle = "Fork: Parallel Futures";
const siteDescription =
  "Type a hard decision. Spin up parallel Hermes agents, each living out one path, researching, reasoning, and reporting back. Watch the futures branch in real time, then get a recommendation.";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    images: [
      {
        url: "/cover.png",
        width: 1000,
        height: 704,
        alt: "Fork: Parallel Futures",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/cover.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${spectral.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}

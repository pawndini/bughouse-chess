/**
 * @module app/layout
 *
 * Root Next.js layout: global fonts, SEO metadata, viewport constraints, and the
 * {@link AppShell} chrome that wraps every page. The document is clamped to the
 * viewport height so only inner regions (move list, modals) scroll.
 */
import type { Metadata, Viewport } from "next";
import { Fira_Code, Inter, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Providers from "./providers";
import AppShell from "./components/layout/AppShell";
import { metadataBase } from "./utils/platform/siteMetadata";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  display: "swap",
});

/** Default `<title>` and Open Graph title for the marketing home page. */
const siteTitle = "Bug Bully - Bughouse Analysis";

/** Short description reused across metadata, Open Graph, and Twitter cards. */
const siteDescription = "A minimalistic elegant tool for analyzing and replaying Bughouse Chess matches";

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: siteTitle,
    template: "%s | Bug Bully",
  },
  description: siteDescription,
  applicationName: "Bug Bully",
  keywords: [
    "bughouse",
    "bughouse chess",
    "analysis board",
    "chess analysis",
    "bug bully",
    "game replay",
    "chess viewer",
    "chess variants",
  ],
  category: "Games",
  creator: "Bug Bully",
  publisher: "Bug Bully",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: "/",
    title: siteTitle,
    description: siteDescription,
    siteName: "Bug Bully",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Bug Bully - Bughouse Analysis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico?v=bug-bully-red-pawn" },
      { url: "/favicon-32x32.png?v=bug-bully-red-pawn", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png?v=bug-bully-red-pawn", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png?v=bug-bully-red-pawn",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

/**
 * Root layout sets global fonts, background, and wraps pages with shared providers.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${inter.variable} ${playfair.variable} ${firaCode.variable}`}
    >
      {/* Hard clamp the app to the viewport: the document should never scroll.
          Scrollable regions (like the move list) handle their own overflow. */}
      <body className="h-dvh overflow-hidden antialiased">
        <Providers>
          {/* Allow certain pages (e.g. viewer) to visually extend their top navbar
              into the sidebar column without being clipped horizontally. */}
          <main className="w-full h-full overflow-y-hidden overflow-x-visible">
            <AppShell>
              {children}
            </AppShell>
          </main>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}

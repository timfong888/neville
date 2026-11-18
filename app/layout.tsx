import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Type and colour follow the screens in Tim's PRD: a geometric sans for
// headings and the wordmark, a plain sans for body text.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Neville — prototype",
  description:
    "Type what you want, hear your manifestation. Architecture and Demo 1 prototype.",
  robots: { index: false, follow: false },
  appleWebApp: { title: "Neville", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#151820",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand" aria-label="Neville, home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={30} height={30} />
            <span>neville</span>
          </Link>
          <nav>
            <Link href="/">Demo</Link>
            <Link href="/voices">Voices</Link>
            <Link href="/architecture">Architecture</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="foot">
          Prototype. Voice is your browser&rsquo;s built-in speech; no paid APIs are
          called and nothing is stored on a server.
        </footer>
      </body>
    </html>
  );
}

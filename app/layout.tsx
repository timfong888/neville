import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neville — prototype",
  description:
    "Type what you want, hear your manifestation. Architecture and Demo 1 prototype.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10111f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">
            Neville
          </Link>
          <nav>
            <Link href="/">Demo</Link>
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

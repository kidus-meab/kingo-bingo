import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import Script from "next/script";

import { TelegramBootstrap } from "@/components/ui/telegram-bootstrap";

import "./globals.css";

const monaSans = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kingo Bingo",
  description: "Play bingo in Telegram",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${monaSans.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TelegramBootstrap />
        {children}
      </body>
    </html>
  );
}

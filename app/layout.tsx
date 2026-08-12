import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StorefrontPreferences from "./storefront-preferences";
import StorefrontSearchRouter from "./storefront-search-router";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rumbo | Vuelos, hoteles y paquetes",
  description:
    "Encuentra vuelos, hoteles y paquetes para viajar por el Perú y el mundo.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <StorefrontPreferences />
        <StorefrontSearchRouter />
      </body>
    </html>
  );
}

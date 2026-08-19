import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Slaivio",
    template: "%s | Slaivio",
  },
  description: "Plateforme opérationnelle Slaivio pour les agences.",
  icons: {
    icon: [
      {
        url: "/icon.png",
        type: "image/png",
      },
      {
        url: "/favicon.ico",
        sizes: "any",
      },
      {
        url: "/slaivio-icon-official.png",
        type: "image/png",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`h-full ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

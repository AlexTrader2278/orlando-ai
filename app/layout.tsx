import type { Metadata, Viewport } from "next";
import SwRegister from "./sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orlando-AI — сервисная книжка",
  description:
    "Личный AI-помощник владельца Chevrolet Orlando: история ремонтов и вопросы сообществу.",
  applicationName: "Orlando-AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Orlando-AI",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-192.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1e2a4f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-bg text-ink">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}

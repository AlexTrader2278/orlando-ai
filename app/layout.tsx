import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orlando-AI — спроси сообщество Chevrolet Orlando",
  description:
    "AI-помощник владельца Chevrolet Orlando. Реальный опыт 800 владельцев из ТГ-чата + экспертные знания.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-bg text-ink">{children}</body>
    </html>
  );
}

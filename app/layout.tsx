import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Taste — реальная история музыкального вкуса", template: "%s · Taste" },
  description: "Следите за реальной, добровольно опубликованной историей прослушиваний людей, чьему вкусу доверяете.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: { title: "Taste", description: "Музыкальный вкус — вживую.", type: "website", locale: "ru_RU" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}


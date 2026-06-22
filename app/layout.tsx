import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetterBox Admin",
  description: "Quản lý truyện và chapter cho BetterBox pipeline"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

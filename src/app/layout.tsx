import type { Metadata } from "next";
import { Yuji_Syuku } from "next/font/google";
import "./globals.css";

const yujiSyuku = Yuji_Syuku({
  weight: "400",
  subsets: ["latin"],
  preload: false,
  variable: "--font-yuji",
});

export const metadata: Metadata = {
  title: "七夕かざり 〜星に願いを〜",
  description: "願い事を書いた短冊を笹に飾る七夕ディスプレイ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${yujiSyuku.variable} antialiased`}>{children}</body>
    </html>
  );
}

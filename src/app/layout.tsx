import type { Metadata, Viewport } from "next";
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

// 縦型サイネージ等でシステムバー分の余白を正しく扱うため viewport-fit=cover。
// ズーム操作は無効化して常に全画面表示にする。
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
    <html lang="ja">
      <head>
        {/* React に依存せず(古い WebView でハイドレーションが失敗しても)
            実表示領域の高さ1%を --vh に設定する。ES5 構文のみで記述。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function s(){try{document.documentElement.style.setProperty('--vh',(window.innerHeight/100)+'px');}catch(e){}}s();window.addEventListener('resize',s);window.addEventListener('orientationchange',s);})();",
          }}
        />
      </head>
      <body className={`${yujiSyuku.variable} antialiased`}>{children}</body>
    </html>
  );
}

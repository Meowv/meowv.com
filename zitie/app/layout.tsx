import type { Metadata } from "next";
import Script from "next/script";
import SiteFooter from "./components/SiteFooter";
import "./globals.css";

const title = "字帖生成｜在线制作 A4 练字纸";
const description =
  "在线生成可打印的 A4 字帖，支持汉字、词语、段落、拼音、英文、数字、笔画与控笔练习，可导出 PNG、PDF 或直接打印。";
const siteUrl = "https://zt.meowv.com";

// 页面不依赖请求信息，可在构建期预渲染为独立托管的静态文件。
export const dynamic = "force-static";

const fontFaces = `
@font-face { font-family: "Practice En Italic"; src: url("/fonts/practice-en-italic.woff2") format("woff2"); font-display: swap; font-style: italic; font-weight: 400 700; }
@font-face { font-family: "Practice Pinyin"; src: url("/fonts/practice-pinyin.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Practice Strokes"; src: url("/fonts/practice-strokes.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Practice Pen Control"; src: url("/fonts/practice-pen-control.woff2") format("woff2"); font-display: block; font-weight: 400 700; }
`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: { canonical: siteUrl },
  openGraph: { type: "website", locale: "zh_CN", url: siteUrl, title, description },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/icon.png" />
        <link rel="shortcut icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <style>{fontFaces}</style>
      </head>
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-EPJQW4WXS0"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-EPJQW4WXS0');`}
        </Script>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

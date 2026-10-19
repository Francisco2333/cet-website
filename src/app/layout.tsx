import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AiProvider } from "@/components/ai-provider";
import { APP_NAME, APP_URL } from "@/lib/const";
import { assetUrl } from "@/lib/paths";

export const metadata: Metadata = {
  ...(APP_URL ? { metadataBase: new URL(`${APP_URL}/`) } : {}),
  title: { default: `${APP_NAME} · 四六级在线练习`, template: `%s | ${APP_NAME}` },
  description: "四六级真题在线预览、整卷答题、听力播放与自主计时。支持自带 API 的划词翻译。",
  icons: { icon: assetUrl("/favicon.svg") },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch{}})()` }} /></head>
    <body className="min-h-full flex flex-col"><AiProvider><Header /><main id="main-content" className="flex-1">{children}</main><Footer /></AiProvider></body>
  </html>;
}

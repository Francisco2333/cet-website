import Link from "next/link";
import { APP_NAME } from "@/lib/const";

export function Footer() {
  return <footer className="site-footer"><div className="max-w-7xl mx-auto space-y-5">
    <div className="flex flex-wrap justify-between gap-4 text-sm"><span className="font-medium">{APP_NAME} · 把时间留给练习</span><nav aria-label="页脚导航" className="flex flex-wrap gap-5 text-muted"><Link href="/about">关于</Link><Link href="/faq">帮助</Link><Link href="/contact">问题反馈</Link><Link href="/privacy">隐私</Link><Link href="/terms">条款与版权</Link></nav></div>
    <p className="text-xs text-muted leading-6">本项目基于开源项目 <a href="https://github.com/whoamiARC/cet-website" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">whoamiARC/cet-website</a> 进行二次开发，遵循原项目适用的开源许可证。</p>
    <p className="text-xs text-muted">MIT 许可仅适用于源代码；真题、解析与音频版权归各自权利人所有，仅供个人学习。</p>
  </div></footer>;
}

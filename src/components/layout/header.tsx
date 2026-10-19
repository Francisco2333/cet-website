"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Menu, X } from "lucide-react";
import { useState } from "react";
import { APP_NAME } from "@/lib/const";
import { BASE_PATH } from "@/lib/paths";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiSettingsButton } from "@/components/ai-provider";

const items = [{ href: "/library/cet4", label: "四级题库" }, { href: "/library/cet6", label: "六级题库" }, { href: "/practice/sample", label: "原创练习" }, { href: "/faq", label: "使用帮助" }];
export function Header() {
  const pathname = usePathname().replace(BASE_PATH, "");
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <a href="#main-content" className="sr-only focus:not-sr-only">跳到主要内容</a>
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
      <Link href="/" className="flex items-center gap-2 font-semibold text-lg"><BookOpen className="text-primary" size={24} />{APP_NAME}</Link>
      <nav className="hidden lg:flex gap-1" aria-label="主导航">{items.map((item) => <Link className={`px-3 py-2 rounded-md text-sm ${pathname.startsWith(item.href) ? "text-primary bg-primary-soft" : "text-muted hover:text-primary"}`} key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <div className="flex items-center gap-2"><AiSettingsButton /><ThemeToggle /><button className="tool-button mobile-menu-button" aria-label="切换菜单" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button></div>
    </div>
    {open && <nav className="lg:hidden px-4 pb-4 grid gap-1" aria-label="移动导航">{items.map((item) => <Link className="py-2 text-sm" key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}</nav>}
  </header>;
}

"use client";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* 当前页面主题仍可切换。 */ }
  }
  return <button className="tool-button" aria-label="切换明暗主题" onClick={toggle}><Sun className="hidden dark:block" size={16} /><Moon className="dark:hidden" size={16} /></button>;
}

"use client";
import { Sun, Moon } from "lucide-react";
import { useState } from "react";

export function ThemeToggle() {
  const [error, setError] = useState("");
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); setError(""); } catch { setError("主题已切换，但偏好保存失败，请检查浏览器存储权限或空间。"); }
  }
  return <span className="relative inline-flex"><button className="tool-button" aria-label="切换明暗主题" onClick={toggle}><Sun className="hidden dark:block" size={16} /><Moon className="dark:hidden" size={16} /></button>{error && <span className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-border bg-card p-3 text-xs text-danger" role="alert">{error}</span>}</span>;
}

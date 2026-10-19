import Link from "next/link";
import { ArrowRight, Headphones, FileText, PenLine } from "lucide-react";
import { getExamsByLevel } from "@/lib/library";

export default function HomePage() {
  return <div className="max-w-6xl mx-auto px-5 py-12 md:py-20">
    <section className="max-w-3xl mb-12"><p className="eyebrow">CET PRACTICE / 四六级学习工作台</p><h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight mb-6">打开一套真题，<br /><span className="text-primary">专注完成一次练习。</span></h1><p className="text-muted text-lg leading-8 max-w-xl">阅读原卷，边听边答，按自己的节奏计时。从第一题到最后一段作文，都在同一个工作台。</p><div className="flex flex-wrap gap-3 mt-7"><Link className="primary-button" href="/library/cet4">进入四级题库<ArrowRight size={16} /></Link><Link className="tool-button" href="/library/cet6">进入六级题库</Link><Link className="tool-button" href="/practice/sample">体验原创完整练习</Link></div></section>
    <section className="grid md:grid-cols-2 gap-5" aria-label="选择考试级别">{(["cet4", "cet6"] as const).map((level) => {
      const papers = getExamsByLevel(level);
      return <Link key={level} href={`/library/${level}`} className="panel p-7 md:p-9 hover:border-primary transition-colors"><p className="eyebrow">{level.toUpperCase()}</p><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">英语{level === "cet4" ? "四级" : "六级"}</h2><ArrowRight className="text-primary" size={22} /></div><p className="text-sm text-muted mt-3">{papers.length} 套真题 · 2019–2025</p><p className="text-sm text-muted mt-6 leading-7">试卷预览与答题卡 · 原文件下载<br />{papers.filter((p) => p.hasAudio).length} 套含听力音频</p></Link>;
    })}</section>
    <section className="grid md:grid-cols-3 gap-7 mt-12 border-t border-border pt-8" aria-label="学习功能">{[{ Icon: FileText, title: "原卷就在手边", text: "站内翻页、缩放，随时查看原始试卷与解析。" }, { Icon: Headphones, title: "听力与作答同步", text: "切换题号、选择答案，不打断正在播放的音频。" }, { Icon: PenLine, title: "练习进度留在这里", text: "选择题、翻译、作文自动保存到当前浏览器，刷新后继续。" }].map(({ Icon, title, text }) => <div key={title}><Icon className="text-primary mb-4" size={22} /><h3 className="font-semibold mb-2">{title}</h3><p className="text-sm text-muted leading-7">{text}</p></div>)}</section>
    <p className="mt-10 text-xs text-muted leading-6">真题采用 PDF 配合答题卡，暂未导入标准答案键，不提供自动评分。原创示例支持客观题核对。无需注册；AI 翻译可选。</p>
  </div>;
}

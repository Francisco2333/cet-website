import Link from "next/link";
import { ChevronRight, Headphones } from "lucide-react";
import { getExamsByLevel, groupByYear } from "@/lib/library";
import type { Level } from "@/lib/exam";

export function ExamList({ level }: { level: Level }) {
  const exams = getExamsByLevel(level);
  const groups = groupByYear(exams);
  return <div className="max-w-5xl mx-auto px-4 py-10"><p className="eyebrow">PAPER LIBRARY / {level.toUpperCase()}</p><h1 className="text-3xl md:text-4xl font-semibold mb-3">英语{level === "cet4" ? "四级" : "六级"}题库</h1><p className="text-muted text-sm leading-7 mb-7">{exams.length} 套真题 · 站内预览、整卷答题卡与原文件下载。听力和答案按实际收录提供，真题暂无自动评分。</p><div className="flex gap-2 mb-8"><Link className="tool-button" href={`/library/${level === "cet4" ? "cet6" : "cet4"}`}>切换到{level === "cet4" ? "六级" : "四级"}</Link><Link className="tool-button" href="/practice/sample">体验可批改的原创练习</Link></div>
    <div className="space-y-6">{Array.from(groups).map(([year, papers]) => <section key={year} className="panel overflow-hidden"><div className="px-5 py-3 border-b border-border flex justify-between items-center"><h2 className="font-semibold">{year}</h2><span className="text-xs text-muted">{papers.length} 套</span></div><div className="divide-y divide-border">{papers.map((paper) => <Link key={paper.id} href={`/library/${level}/${paper.id}`} className="px-5 py-4 flex justify-between items-center gap-3 hover:bg-primary-soft transition-colors"><div><h3 className="text-sm font-medium">{paper.label}</h3><div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted"><span>{paper.resources.paper ? "可预览 · 可在线作答" : "仅支持下载"}</span><span>{paper.resources.answer ? "有答案 PDF" : "暂无答案 PDF"}</span>{paper.hasAudio && <span className="text-success flex items-center gap-1"><Headphones size={12} />有听力</span>}</div></div><ChevronRight size={18} className="text-muted shrink-0" /></Link>)}</div></section>)}</div>
  </div>;
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getExamsByLevel, getExam } from "@/lib/library";
import ExamDetail from "@/components/exam-detail";

export const dynamic = "force-static";

export function generateStaticParams() {
  return getExamsByLevel("cet4").map((e) => ({ testId: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ testId: string }> }): Promise<Metadata> {
  const { testId } = await params;
  const exam = getExam("cet4", testId);
  if (!exam) return { title: "未找到" };
  return { title: `${exam.label} - 英语四级真题`, description: `CET-4 ${exam.label} 真题试卷、答案解析${exam.hasAudio ? "、听力音频" : ""}。免费在线查看和下载。` };
}

export default async function CET4Detail({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const exam = getExam("cet4", testId);
  if (!exam) notFound();

  return <ExamDetail exam={exam} />;
}

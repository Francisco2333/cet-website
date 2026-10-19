import { ExamWorkspace } from "@/components/practice/exam-workspace";
import { createTemplate } from "@/lib/exam";
import type { ExamPaper } from "@/lib/library";

export default function ExamDetail({ exam }: { exam: ExamPaper }) {
  return <ExamWorkspace paper={createTemplate(exam)} />;
}

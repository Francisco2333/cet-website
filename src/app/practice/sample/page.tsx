import { ExamWorkspace } from "@/components/practice/exam-workspace";
import { SAMPLE_PAPER } from "@/lib/sample-paper";
import { validatePaper } from "@/lib/exam";
export const metadata = { title: "原创完整流程练习" };
export default function SamplePage() {
  const errors = validatePaper(SAMPLE_PAPER);
  if (errors.length) throw new Error(errors.join("；"));
  return <ExamWorkspace paper={SAMPLE_PAPER} />;
}

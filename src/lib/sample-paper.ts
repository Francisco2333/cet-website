import scenes from "../data/sample-listening.json";
import { letters, type PracticePaper, type Question } from "./exam";

function choice(number: number, prompt: string, texts: string[], correctAnswer: string, explanation: string): Question {
  return { id: String(number), number, prompt, options: texts.map((text, i) => ({ id: String.fromCharCode(65 + i), text })), correctAnswer, explanation };
}
const words = ["quiet", "weekly", "borrow", "repair", "local", "shared", "reduce", "carefully", "return", "confidence", "distant", "noisy", "waste", "rarely", "empty"];
const vocab = [
  ["The room offers a (26) place to read.", "A", "quiet 修饰 place。"],
  ["We hold a (27) meeting every Friday.", "B", "weekly 表示每周的。"],
  ["Students may (28) tools instead of buying them.", "C", "borrow 表示借用。"],
  ["Volunteers help us (29) broken chairs.", "D", "repair 表示修理。"],
  ["Most visitors live in the (30) neighbourhood.", "E", "local 表示本地的。"],
  ["The kitchen is a (31) space for everyone.", "F", "shared 表示共用的。"],
  ["Reusing materials can (32) waste.", "G", "reduce waste 表示减少浪费。"],
  ["Read the safety instructions (33).", "H", "carefully 是修饰 read 的副词。"],
  ["Please (34) each tool after use.", "I", "return 表示归还。"],
  ["Learning a new skill can build (35).", "J", "build confidence 表示建立信心。"],
];
const matchingParagraphs = [
  "A. The library keeps its ground floor silent. Phone calls must be taken outside.",
  "B. The cafe gives a small discount to customers who bring their own cups.",
  "C. A repair desk opens on Friday. Volunteers mend bags and clothes.",
  "D. The garden collects rainwater in two large tanks for dry days.",
  "E. A student bus pass is cheaper than buying a separate ticket each morning.",
  "F. The language club pairs new students with conversation partners.",
  "G. A noticeboard lists bicycles that students want to sell or give away.",
  "H. The sports centre offers a beginner swimming class on Tuesday.",
  "I. The kitchen labels food with its preparation date to prevent unnecessary waste.",
  "J. The study group compares different solutions rather than memorising one answer.",
];
const matching = [
  ["Reusable containers can save a customer money.", "B"],
  ["Learners discuss more than one approach to a problem.", "J"],
  ["Water is stored for periods without rain.", "D"],
  ["Second-hand transport is advertised here.", "G"],
  ["People can practise speaking with a partner.", "F"],
  ["Food is dated before it is stored.", "I"],
  ["A quiet area has a rule about telephone calls.", "A"],
  ["An activity is designed for people who cannot yet swim well.", "H"],
  ["Clothing can be repaired once a week.", "C"],
  ["A travel pass reduces the cost of daily journeys.", "E"],
];
const readingPassage = "Passage One\nA university tool library lends equipment that students need only occasionally. Members pay no fee, but they must return items within seven days. Before borrowing electrical tools, they attend a short safety session. In its first term, the library recorded 240 loans. This number shows that the service was used; it does not prove how much money students saved. The organisers plan to ask borrowers about costs next term.\n\nPassage Two\nMina used to read her notes repeatedly before tests. She felt familiar with the words but often struggled to explain them. She began closing her notebook and writing a short explanation from memory. Afterwards, she checked the explanation and corrected missing details. This method felt harder and took more effort. Over time, Mina noticed that she could explain ideas more clearly. Her experience is one person's account, not a controlled study of all students.";

export const SAMPLE_PAPER: PracticePaper = {
  id: "original-complete", level: "cet4", year: 2026, title: "原创完整流程练习 · 57 项", revision: 1, mode: "structured",
  source: "本项目原创示例，MIT；非官方试卷，篇幅与难度不模拟正式考试。",
  answerSource: "本项目原创题目及作者核定答案，客观题解析均可对照原文核验。",
  resources: { audio: "/examples/listening.wav" },
  sections: [
    { id: "writing", title: "写作", kind: "writing", instructions: "Write about a small change that improved your study routine.", questions: [{ id: "writing", prompt: "Describe the change, explain why you tried it, and reflect on its benefits and limits. Aim for 120–180 words. This response is saved but not automatically graded." }] },
    { id: "listening", title: "听力", kind: "listening", instructions: "Listen to five short announcements and answer questions 1–25.", passage: "本示例使用原创合成语音，每段对应五题，并非官方录音。可以边听边答，提交后核对客观题。", questions: scenes.flatMap((scene, index) => scene.questions.map(([prompt, options, answer, explanation], i) => choice(index * 5 + i + 1, prompt as string, options as string[], answer as string, explanation as string))) },
    { id: "cloze", title: "选词填空", kind: "cloze", instructions: "Choose the word that best completes each sentence. Each word is used at most once.", passage: "Word bank: " + words.map((word, i) => `${String.fromCharCode(65 + i)}. ${word}`).join(" · "), questions: vocab.map(([prompt, correctAnswer, explanation], i) => ({ id: String(26 + i), number: 26 + i, prompt, options: words.map((text, index) => ({ id: String.fromCharCode(65 + index), text })), correctAnswer, explanation })) },
    { id: "matching", title: "信息匹配", kind: "matching", instructions: "Match each statement to a paragraph A–J.", passage: matchingParagraphs.join("\n\n"), questions: matching.map(([prompt, correctAnswer], i) => ({ id: String(36 + i), number: 36 + i, prompt, options: letters(10).map((o) => ({ ...o, text: `Paragraph ${o.id}` })), correctAnswer, explanation: `与段落 ${correctAnswer} 的明确信息对应。` })) },
    { id: "reading", title: "仔细阅读", kind: "reading", instructions: "Read the two passages and choose the best answer.", passage: readingPassage, questions: [
      choice(46, "What does the tool library lend?", ["Occasionally needed equipment", "Only textbooks", "Food", "Private rooms"], "A", "第一句说明出借偶尔才需要的工具。"),
      choice(47, "When must an item be returned?", ["Within a day", "Within seven days", "Within a month", "At the end of the year"], "B", "原文规定七天内归还。"),
      choice(48, "What is required before borrowing electrical tools?", ["A deposit", "An exam", "A safety session", "A recommendation"], "C", "须先参加简短安全培训。"),
      choice(49, "What does the figure 240 describe?", ["Money saved", "Members", "Lost items", "Loans in the first term"], "D", "240 是首学期的借出次数。"),
      choice(50, "What will organisers investigate next?", ["Borrowers' costs", "The weather", "Exam grades", "Canteen menus"], "A", "计划询问借用者的成本。"),
      choice(51, "What was Mina's earlier method?", ["Group discussion", "Repeatedly reading notes", "Teaching a class", "Drawing maps"], "B", "她原先反复阅读笔记。"),
      choice(52, "What did she do after closing her notebook?", ["Go to sleep", "Copy every word", "Explain an idea from memory", "Take a formal test"], "C", "合上笔记后凭记忆写解释。"),
      choice(53, "How did she use her written explanation?", ["She published it", "She threw it away", "She sent it to a teacher", "She checked and corrected it"], "D", "随后检查并纠正遗漏。"),
      choice(54, "How did the new method initially feel?", ["More demanding", "Effortless", "Boring but easy", "Exactly the same"], "A", "新方法感觉更难、更费力。"),
      choice(55, "What limitation does the author mention?", ["No notebooks were available", "This is one person's experience", "All students were tested", "The library was closed"], "B", "个人经历不能等同于受控研究。"),
    ] },
    { id: "translation", title: "翻译", kind: "translation", instructions: "Translate the following paragraph into English.", questions: [{ id: "translation", prompt: "越来越多的大学生开始共享学习资源。有人交换笔记，有人组织讨论小组，还有人借出不常使用的工具。共享可以减少浪费，但也需要清晰的规则。借用者应按时归还物品，并尊重他人的劳动。请将这段原创中文译成英文；本题只保存答案，不自动评分。" }] },
  ],
};

import Link from "next/link";
export const metadata = { title: "关于" };
export default function AboutPage() {
  return <article className="prose-page"><h1>关于 CET 通</h1><p>一个以原始试卷为中心的四六级练习平台，提供站内 PDF 阅读、整卷答题卡、听力播放、可选计时与自带密钥的 AI 翻译和批改。</p><h2>数据与评分</h2><p>现有真题资源包含试卷、部分答案解析和听力，尚无经过核验的结构化题干或标准答案键。真题客观题不自动评分；原创示例客观题可核对。写作和翻译在补全题目与答案后可选择 AI 模拟批改，非官方成绩，不计入客观题结果。</p><h2>项目来源</h2><p>本项目基于开源项目 <a href="https://github.com/whoamiARC/cet-website" target="_blank" rel="noopener noreferrer">whoamiARC/cet-website</a> 进行二次开发，遵循原项目适用的开源许可证。</p><p>保留原 MIT 版权和许可声明。MIT 只适用于源代码，真题、解析及音频仍受各自版权限制，仅供个人学习，不得用于商业用途或大规模传播。</p><h2>本地数据</h2><p>练习记录保存在当前浏览器，清除浏览器数据会删除记录。可在工作台导出作答备份。AI 密钥只保存在当前页面内存，刷新后清除。</p><p><Link href="/privacy">查看隐私说明</Link> · <Link href="/faq">使用帮助</Link></p></article>;
}

# Repository Guidelines

## 项目结构与模块组织

本项目是采用 Next.js 16 App Router、React 19、TypeScript 和 Tailwind CSS 4 的四六级真题网站，静态导出到 `out/`，由 GitHub Pages 部署。

- `src/app/`：页面、布局、全局样式与站点元数据；题库路由位于 `library/cet4/` 和 `library/cet6/`。
- `src/components/`：共享界面组件；`layout/` 存放页头与页脚。
- `src/lib/`：题库索引 `library.ts`、常量与工具函数。
- `public/`：图片和静态资源；试卷、答案、听力存放在 `library/<level>/<testId>/`。
- `scripts/sync-from-wehuster.ts`：外部题库同步脚本。当前没有独立测试目录。

## 安装、开发与构建

使用 npm 和 `package-lock.json`，Node.js 版本与 CI 的 20 保持一致。

- `npm ci`：按锁文件安装依赖。
- `npm run dev`：启动开发服务，默认访问 `http://localhost:3000`。
- `npm run lint`：执行 ESLint，使用 Next.js Core Web Vitals 和 TypeScript 规则。
- `npx tsc --noEmit`：检查 TypeScript 类型。
- `npm run build`：构建并生成静态站点 `out/`；`npm run export` 是同一命令的别名。

当前配置为 `output: "export"`，生产预览应通过静态服务器提供 `out/`，不要使用 `npm run start`。README 中数据库、鉴权与环境变量步骤与当前实现不符，应以代码和配置为准。

## 代码风格与命名

遵守 `.editorconfig`：UTF-8、LF、两空格缩进、文件末尾换行。TypeScript 启用严格模式，沿用双引号、分号及 `@/` 导入别名。组件使用 PascalCase，函数与变量使用 camelCase，组件文件使用 kebab-case，例如 `theme-toggle.tsx`。路由沿用 `page.tsx`、`layout.tsx` 和 `[testId]` 命名。样式优先沿用 Tailwind 工具类与现有全局变量；目前未配置 Prettier。

## 验证要求

当前没有自动测试框架、`npm test` 脚本、覆盖率门槛或测试文件命名约定。代码变更提交前执行 lint、类型检查和构建；界面变更手动检查移动端、桌面端及明暗主题。题库变更检查列表、详情页、PDF 下载和听力播放，确认不存在的试卷进入 404 页面。

## 提交与 Pull Request

近期提交使用 `feat:`、`fix:`、`refactor:` 前缀，后接简短变更说明，可使用中文。每次提交聚焦一个目的。PR 应说明改动原因、涉及页面及验证结果；有关联 Issue 时附链接，界面变更附截图，题库变更列出级别和试卷 ID。

## 题库资源维护

保持 `public/library/<level>/<testId>/` 与 `src/lib/library.ts` 一致。ID 示例：`2025_06_1`、`2023_03_2-3`；资源固定命名为 `test.pdf`、`answer.pdf`、`listening.mp3`，并按实际文件设置 `hasAudio`。同步脚本会访问外部站点并写入资源，运行前确认授权。新增依赖、部署配置变更也须先确认；不要提交密钥、`.env*`、`node_modules/`、`.next/` 或 `out/`。

# Execution Plan: mermaid 图表渲染

## Summary
为 Markdown 预览添加 mermaid 代码块的 SVG 渲染能力，支持明暗主题适配和全屏缩放交互。

## Tasks

- [ ] T1: markdown.ts 新增 mermaid 代码块占位输出
  - Files: `src/renderer/src/utils/markdown.ts`
  - Change: `highlight` 回调中检测 `lang === 'mermaid'`，输出 `<div class="mermaid-src" data-mermaid><code>{转义源码}</code></div>` 占位容器，跳过 hljs 处理
  - Verify: 宿主机打开含 mermaid 代码块的 .md，检查 HTML 中出现 `data-mermaid` 标记

- [ ] T2: 新增 useMermaid hook
  - Files: `src/renderer/src/hooks/useMermaid.ts`（新增）
  - Change: 创建 hook 接收 containerRef，在 `html` 变化后扫描 `[data-mermaid]` 元素，调用 `mermaid.render()` 将占位替换为 SVG；管理 mermaid 初始化配置（根据 `data-theme` 决定 `theme: 'dark' | 'default'`）；effect cleanup 中标记 cancelled 防止过期渲染；主题变化时重新初始化 mermaid 并重渲染所有图表
  - Verify: hook 内部逻辑通过宿主机渲染验证
  - Depends on: T1

- [ ] T3: MarkdownView 集成 mermaid 渲染和缩放模态
  - Files: `src/renderer/src/components/MarkdownView.tsx`
  - Change: 导入并调用 `useMermaid` hook 传入 containerRef；新增全屏缩放模态状态（isVisible、scale、translate）；SVG 单击事件委托打开模态，模态内支持 wheel 缩放和 mousedown 拖拽平移，Esc 关闭
  - Verify: 宿主机验证 mermaid 渲染、缩放、拖拽、Esc 退出
  - Depends on: T2

- [ ] T4: 新增 mermaid.css 样式文件
  - Files: `src/renderer/src/mermaid.css`（新增）、`src/renderer/src/main.tsx`
  - Change: 创建 mermaid.css，定义图表容器样式（居中、背景、圆角、阴影）、全屏模态遮罩和缩放容器样式；在 main.tsx 中导入 mermaid.css
  - Verify: 样式正确应用，明暗主题下图表外观正常
  - Depends on: T3

- [ ] T5: 安装 mermaid 依赖（宿主机操作）
  - Files: `package.json`
  - Change: `pnpm add mermaid`
  - Verify: `pnpm install` 成功，类型检查通过
  - Depends on: none（可最先执行或与 T1 并行）

## Verification
- Commands: 宿主机执行 `pnpm build`（类型检查 + 编译）
- Manual checks:
  1. 创建含 ```` ```mermaid \n graph TD\n A-->B ```` 的 .md 文件，确认渲染为 SVG
  2. 切换明暗主题，确认图表颜色方案跟随变化
  3. 单击图表进入全屏模态，滚轮缩放、拖拽平移、Esc/点击遮罩退出
  4. mermaid 语法错误时显示错误提示
  5. 非 mermaid 代码块不受影响

## Task Relationships
- Strongly related: T1 + T2 + T3（mermaid 渲染管线，前后依赖且共享渲染上下文）
- Weakly related: T4（样式与渲染逻辑边界清楚，可在 T3 完成后独立调整）
- Independent: T5（依赖安装，与代码修改无冲突）
- Conflict risks: none

## RouteSync
- Need route-sync: yes
- Expected updates: Markdown 渲染模块新增 mermaid 图表渲染条目

## Risks
- mermaid 包体积较大，但作为 Wiki 阅读器功能属于合理依赖
- mermaid.render 异步调用需正确管理生命周期，避免组件卸载后更新 DOM

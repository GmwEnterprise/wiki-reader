# Markdown Wiki Reader 开发计划

> 基于设计方案 `docs/superpowers/specs/2026-04-24-markdown-wiki-reader-design.md`

## 阶段概览

| 阶段 | 计划文件 | 产出 |
|------|----------|------|
| Phase 1 | `docs/superpowers/plans/2026-04-24-phase1-project-scaffolding.md` | Electron 应用能启动，显示基本布局 |
| Phase 2 | `docs/superpowers/plans/2026-04-24-phase2-workspace-file-browser.md` | 能打开文件夹、浏览文件树 |
| Phase 3 | `docs/superpowers/plans/2026-04-24-phase3-markdown-rendering-headings.md` | Markdown 渲染 + 标题导航 |
| Phase 4 | `docs/superpowers/plans/2026-04-24-phase4-source-editor-save.md` | CodeMirror 源码编辑 + 保存 |
| Phase 5 | `docs/superpowers/plans/2026-04-24-phase5-theme-system.md` | 明暗主题切换 + 持久化 |
| Phase 6 | `docs/superpowers/plans/2026-04-24-phase6-terminal-integration.md` | 底部终端面板 |
| Phase 7 | `docs/superpowers/plans/2026-04-24-phase7-multiwindow-error-handling.md` | 多窗口 + 欢迎页 + 错误处理 |

## 分组说明

- **Phase 1-4（核心功能）**：从空目录到完整的 Markdown 阅读器/编辑器
- **Phase 5-7（增强功能）**：主题、终端、多窗口和健壮性

每个阶段都产出可运行、可验证的软件，建议按顺序执行。

## 执行方式

1. **Subagent-Driven（推荐）** — 每个任务分派独立子代理执行，任务间审查
2. **Inline Execution** — 在当前会话中逐批执行，设置检查点

## 技术栈

Electron 33+ / React 18 / TypeScript 5 / electron-vite / markdown-it / highlight.js / CodeMirror 6 / xterm.js / node-pty / chokidar

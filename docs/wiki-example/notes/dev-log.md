# 开发日志

Wiki Reader 项目开发过程中的记录和笔记。

## 2026-04-25 创建示例知识库

今天为 Wiki Reader 创建了一套完整的 Markdown 示例文件，用于测试各项渲染功能。

### 完成的工作

- 创建了 `docs/wiki-example/` 目录结构
- 下载了 5 张测试图片到 `img/` 目录
- 编写了以下文档：
  - `README.md` — 知识库索引
  - `getting-started.md` — 基础格式演示
  - `code-examples.md` — 多语言代码高亮
  - `architecture.md` — Mermaid 图表演示
  - `guide/images.md` — 图片引用
  - `guide/advanced.md` — 表格、脚注、公式
  - `guide/cross-reference.md` — 交叉引用
  - 本文件

### 待验证的功能

- [ ] 所有代码块的语法高亮是否正确
- [ ] Mermaid 图表是否正常渲染
- [ ] 相对路径图片是否正确显示
- [ ] 跨文件链接跳转是否正常
- [ ] 锚点跳转是否精确定位
- [ ] 数学公式是否需要额外插件
- [ ] 折叠内容（`<details>`）是否可用

### 笔记

图片使用 [Picsum Photos](https://picsum.photos/) 的随机图片。Wikimedia Commons 的图片在 WSL 环境下下载失败（返回 HTML 重定向页面），改用 Picsum 解决。

---

## 2026-04-24 Phase 1 完成

项目脚手架搭建完成，Electron 窗口可以正常启动。

### 技术选型

- **electron-vite** 作为构建工具，开箱即用的 Electron + React + TypeScript 支持
- **pnpm** 作为包管理器，节省磁盘空间
- **ESLint + Prettier** 代码质量保障

### 遇到的问题

1. `node-pty` 需要编译原生模块，WSL 环境下安装失败，需要在 Windows 宿主机上安装
2. Electron 的 `contextBridge` 需要仔细设计 API，确保安全性和易用性的平衡

### 下一步

开始 Phase 2：打开文件夹、浏览 Markdown 文件树。参考 [架构图](../architecture.md) 中的文件系统交互流程。

---

## 2026-04-20 项目启动

今天正式启动 Wiki Reader 项目。目标：构建一个类似 Typora 的本地 Markdown wiki 阅读器。

### 核心需求

- 打开本地文件夹作为 wiki 知识库
- 侧栏显示文件树和标题大纲
- Markdown 渲染 + 代码高亮
- 源码查看和编辑
- 明暗主题切换
- 内置终端

### 参考资料

- [Electron 官方文档](https://www.electronjs.org/docs)
- [CodeMirror 6 迁移指南](https://codemirror.net/docs/guide/)
- [markdown-it API](https://github.com/markdown-it/markdown-it)
- [xterm.js](https://xtermjs.org/)

---

*这个开发日志展示了 Wiki 风格的笔记记录方式，包括日期标题、任务列表、引用其他文档等。*

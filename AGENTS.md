# Wiki Reader 项目说明

## 运行环境限制

**重要：当前运行环境为 WSL2，但本应用的依赖安装、编译、运行都需要在宿主机 Windows 11 上执行。**

因此：

- **只负责代码生成和文件编辑**，不执行 `npm install`、`npm run dev`、`npm run build` 等需要运行时环境的命令。
- 当前项目要求使用 `pnpm` 脚本，不使用或要求使用 `npm`。
- 不执行 `npx electron` 相关命令。
- 不执行需要 native 模块编译的命令（如 `node-pty`、`electron` 的安装）。
- 所有验证性命令（启动、编译、测试运行）交给用户在宿主机 Windows 终端中手动执行。
- 可以执行纯文件操作（如 `ls`、`mkdir`、`git status`、`git diff`、`git log`）。

## 项目概况

Markdown Wiki Reader —— 基于 Electron 的本地 Markdown wiki 阅读器，提供类似 Typora 的低干扰阅读体验，同时保留源码查看和编辑能力。

## 技术栈

- **框架**: Electron 33+ / React 18 / TypeScript 5
- **构建**: electron-vite
- **渲染**: markdown-it / highlight.js
- **编辑器**: CodeMirror 6
- **终端**: xterm.js / node-pty
- **文件监听**: chokidar
- **测试**: Vitest

## 项目结构

```
wiki-reader/
├── src/
│   ├── main/                # Electron 主进程
│   │   ├── index.ts         # 应用入口、单实例锁、菜单
│   │   ├── window.ts        # 窗口创建与管理（多窗口）
│   │   ├── window-shortcuts.ts # 窗口快捷键注册
│   │   ├── workspace.ts     # 文件夹扫描、读写、监听
│   │   ├── terminal.ts      # node-pty 终端进程管理
│   │   ├── ipc-handlers.ts  # IPC 通信处理
│   │   └── recent-folders.ts # 最近文件夹记录与 Jump List
│   ├── preload/             # 预加载脚本（安全 API 桥接）
│   │   └── index.ts
│   └── renderer/            # 渲染进程（React）
│       ├── index.html
│       └── src/
│           ├── App.tsx           # 根组件与布局
│           ├── App.css           # 全局样式与基础 CSS 变量
│           ├── main.tsx          # React 入口
│           ├── types.ts          # 类型定义
│           ├── env.d.ts          # 环境类型声明
│           ├── fonts.css         # Maple Mono NF CN 字体声明
│           ├── sidebar.css       # 侧栏模块样式
│           ├── markdown.css      # Markdown 渲染样式
│           ├── heading-list.css  # 标题列表样式
│           ├── components/       # UI 组件
│           │   ├── Sidebar.tsx       # 侧栏容器
│           │   ├── FileList.tsx      # 文件树列表
│           │   ├── HeadingList.tsx   # 标题导航列表
│           │   ├── MarkdownView.tsx  # Markdown 渲染视图
│           │   ├── SourceEditor.tsx  # CodeMirror 源码编辑器
│           │   ├── TerminalPanel.tsx # 终端面板容器
│           │   ├── TerminalTabs.tsx  # 终端标签栏
│           │   ├── TerminalInstance.tsx # 单个终端实例
│           │   ├── terminalLayout.ts   # 终端布局逻辑
│           │   ├── terminalTabActions.ts # 终端标签操作
│           │   └── WelcomePage.tsx    # 欢迎页（最近文件夹）
│           ├── hooks/            # 自定义 Hooks
│           │   ├── useWorkspace.ts    # 工作区状态管理
│           │   ├── useDocument.ts     # 文档加载与保存
│           │   ├── useHeadings.ts     # 标题提取与导航
│           │   ├── useTheme.ts        # 主题切换
│           │   └── useTerminalTabs.ts # 终端标签页管理
│           └── utils/            # 工具函数
│               ├── markdown.ts       # markdown-it 配置与扩展
│               └── headings.ts       # 标题解析工具
├── tests/
│   └── unit/                # 单元测试（Vitest）
├── resources/               # 应用资源
│   ├── fonts/               # Maple Mono NF CN 字体文件
│   └── icon.png             # 应用图标
├── docs/                    # 设计文档和开发计划
├── electron.vite.config.ts
├── electron-builder.json5
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

## 已实现功能

全部 7 个阶段及后续增强均已完成：

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 项目脚手架，Electron 无框窗口、三段式布局 | ✅ |
| Phase 2 | 打开文件夹、浏览 Markdown 文件树、工作区管理 | ✅ |
| Phase 3 | Markdown 渲染（markdown-it + highlight.js）+ 标题导航 | ✅ |
| Phase 4 | CodeMirror 6 源码编辑器 + 手动保存（Ctrl+S） | ✅ |
| Phase 5 | 明暗主题切换 + localStorage 持久化 | ✅ |
| Phase 6 | 底部终端面板（xterm.js + node-pty） | ✅ |
| Phase 7 | 多窗口 + 欢迎页 + 单实例锁 | ✅ |
| 增强 | 多终端标签页（新建/关闭/切换） | ✅ |
| 增强 | 任务栏增强（多窗口预览显示文件夹名）、最近文件夹（Jump List + 欢迎页列表）、菜单控制 | ✅ |
| 增强 | Maple Mono NF CN 统一代码字体 | ✅ |

各阶段计划文件：`docs/superpowers/plans/2026-04-24-phase{N}-*.md`

## 项目编码约定

- 遵循各阶段计划文件中定义的文件结构和代码组织方式。
- 主进程代码放在 `src/main/`，预加载脚本放在 `src/preload/`，渲染进程代码放在 `src/renderer/`。
- 使用 TypeScript strict 模式。
- 渲染进程通过 `contextBridge` 暴露的 API 访问本地能力，不直接使用 Node.js API。
- 组件使用函数式组件和 Hooks。

### CSS 样式组织与可替换设计

- **全局变量**（颜色、间距等基础 token）定义在 `App.css` 的 `:root` 中。
- **模块样式独立文件**：每个 UI 模块（侧栏、工具栏、编辑器、终端等）的样式集中到各自独立的 CSS 文件中（如 `sidebar.css`），不在 `App.css` 中混写。
- **模块 CSS 变量层**：每个模块 CSS 文件在 `:root` 中定义一组 `--{模块名}-*` 变量（如侧栏的 `--sidebar-bg`、`--sidebar-node-indent`），所有硬编码值通过变量引用。第三方样式只需覆盖这些变量或对应选择器即可替换整个模块外观。
- **避免内联样式**：不在 TSX 中用 `style={{ ... }}` 传递视觉样式值。需要组件动态控制的值（如树形缩进深度），通过 CSS 变量传递（`style={{ '--node-depth': depth }}`），实际样式计算留在 CSS 中完成。
- **新增模块时**：创建独立的 `{模块名}.css`，在 `main.tsx` 中导入，遵循相同的变量分层模式。

## 可用 pnpm 脚本（供用户在宿主机执行）

```bash
pnpm dev        # 启动开发服务器
pnpm build      # 构建应用
pnpm preview    # 预览构建结果
pnpm test       # 运行测试
pnpm test:watch # 监听模式运行测试
```

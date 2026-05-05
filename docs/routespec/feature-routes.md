# 功能路由图

## 项目概览

- 应用类型：Electron 桌面应用（Markdown Wiki 阅读器）
- 主要入口：`src/main/index.ts`（主进程）、`src/renderer/src/main.tsx`（渲染进程）
- 核心目录：`src/main/`（主进程）、`src/preload/`（预加载桥接）、`src/renderer/src/`（渲染进程）
- 测试入口：`tests/unit/`

## 模块索引

- 应用启动：应用启动与单实例、应用 Shell 状态
- 窗口管理：多窗口管理、窗口快捷键、自定义标题栏
- IPC 通信：IPC 通信桥接
- 工作区：工作区管理、文件变更监听、路径安全校验
- 侧栏：侧栏容器、文件树浏览、标题导航、侧栏拖拽调整宽度
- 文档：文档加载与保存、CodeMirror 源码编辑器
- Markdown 渲染：Markdown 渲染、图片资源加载
- 主题：明暗主题切换
- 终端：终端面板、终端实例、终端标签页管理
- 最近文件夹：最近文件夹记录、Windows Jump List、欢迎页

## 应用启动

### 应用启动与单实例

- 说明：Electron 应用入口，单实例锁，命令行参数解析，首次窗口创建
- 入口：`src/main/index.ts`
- 核心：`src/main/open-args.ts`（`--open` 参数解析）
- 测试：`tests/unit/initial-open-path-argv.test.ts`、`tests/unit/open-args.test.ts`

### 应用 Shell 状态

- 说明：根据工作区和初始打开路径决定显示工作区视图、加载中或欢迎页
- 入口：`src/renderer/src/appShell.ts`
- 核心：`src/renderer/src/appShell.ts`（`getWorkspaceShellState`）
- 测试：`tests/unit/app-shell.test.ts`

## 窗口管理

### 多窗口管理

- 说明：创建/管理多个 BrowserWindow，每个窗口独立工作区，窗口位置持久化
- 入口：`src/main/window.ts` → `createMainWindow()`
- 核心：`src/main/window.ts`（窗口创建、bounds 持久化、关闭确认）、`src/main/window-bounds.ts`（按工作区路径存储窗口位置）
- 备注：`workspacePathMap` 跟踪窗口↔工作区映射，关闭时自动保存位置

### 窗口快捷键

- 说明：主进程级别拦截键盘快捷键（Ctrl+O 打开文件夹、Ctrl+Shift+N 新建窗口、Ctrl+/ 切换模式、F12 开发者工具等）
- 入口：`src/main/window.ts:140`（`before-input-event` 处理）
- 核心：`src/main/window-shortcuts.ts`
- 测试：`tests/unit/window-shortcuts.test.ts`

### 自定义标题栏

- 说明：无框窗口的自定义标题栏，含菜单按钮、标题、最小化/最大化/关闭按钮
- 入口：`src/renderer/src/App.tsx`（`<header className="toolbar">` 区域）
- 核心：`src/renderer/src/App.tsx:248-315`（工具栏 JSX）、IPC 通过 `src/preload/index.ts` 的 `windowControls` 暴露

## IPC 通信

### IPC 通信桥接

- 说明：通过 contextBridge 暴露安全的渲染进程 API，封装所有 ipcRenderer 调用
- 入口：`src/preload/index.ts`
- 核心：`src/preload/index.ts`（`api` 对象）、`src/main/ipc-handlers.ts`（主进程 handler 注册）

## 工作区

### 工作区管理

- 说明：打开文件夹对话框、扫描 Markdown 文件树、工作区打开/关闭
- 入口：`src/main/ipc-handlers.ts:57-68`（`workspace:openFolder`）
- 核心：`src/main/workspace.ts`（扫描、读写）、`src/renderer/src/hooks/useWorkspace.ts`（渲染侧状态管理）
- 测试：`tests/unit/workspace-asset.test.ts`

### 文件变更监听

- 说明：通过 chokidar 监听工作区 Markdown 文件变化（新增/删除），去抖后通知渲染进程刷新文件列表
- 入口：`src/main/workspace.ts:139-185`（`watchWorkspace`）
- 核心：`src/main/workspace.ts`（`watchWorkspace`、`unwatchWorkspace`）、`src/main/ipc-handlers.ts:135-166`（IPC 桥接）

### 路径安全校验

- 说明：校验文件读写路径是否在工作区根目录内，防止路径遍历攻击
- 入口：`src/main/workspace.ts:133-137`
- 核心：`src/main/workspace.ts`（`validatePath`）
- 测试：`tests/unit/path-validation.test.ts`

## 侧栏

### 侧栏容器

- 说明：侧栏容器，包含"文件"和"标题"两个标签页切换
- 入口：`src/renderer/src/components/Sidebar.tsx`
- 核心：`src/renderer/src/components/Sidebar.tsx`

### 文件树浏览

- 说明：Markdown 文件的树形列表展示，支持展开/折叠目录、虚拟滚动、全部展开/折叠
- 入口：`src/renderer/src/components/FileList.tsx`
- 核心：`src/renderer/src/components/FileList.tsx`（`buildFileTree`、`flattenVisibleNodes`、虚拟滚动）
- 测试：`tests/unit/file-list-tree.test.ts`

### 标题导航

- 说明：从 Markdown 源码提取标题列表，树形展示，支持滚动追踪高亮和点击跳转
- 入口：`src/renderer/src/components/HeadingList.tsx`
- 核心：`src/renderer/src/utils/headings.ts`（`extractHeadings`）、`src/renderer/src/hooks/useHeadings.ts`（IntersectionObserver 追踪）、`src/renderer/src/components/HeadingList.tsx`（树形 UI）
- 测试：`tests/unit/headings-extract.test.ts`

### 侧栏拖拽调整宽度

- 说明：侧栏宽度可通过拖拽分隔条调整，宽度值持久化到 localStorage
- 入口：`src/renderer/src/App.tsx:210-244`（`handleResizeMouseDown`）
- 核心：`src/renderer/src/App.tsx`（侧栏宽度状态 + 鼠标事件处理）

## 文档

### 文档加载与保存

- 说明：文档状态管理（加载、脏标记、保存、模式切换），支持 CodeMirror 内容同步
- 入口：`src/renderer/src/hooks/useDocument.ts`
- 核心：`src/renderer/src/hooks/useDocument.ts`（`loadContent`、`flushSave`、`markDirty`、`syncContent`）

### CodeMirror 源码编辑器

- 说明：基于 CodeMirror 6 的 Markdown 源码编辑器，支持明暗主题、Ctrl+S 保存、Escape 返回预览
- 入口：`src/renderer/src/components/SourceEditor.tsx`
- 核心：`src/renderer/src/components/SourceEditor.tsx`

## Markdown 渲染

### Markdown 渲染

- 说明：使用 markdown-it 渲染 Markdown，含代码高亮（highlight.js）、标题 ID 生成、wiki 链接跳转
- 入口：`src/renderer/src/components/MarkdownView.tsx`
- 核心：`src/renderer/src/utils/markdown.ts`（`renderMarkdown`）、`src/renderer/src/components/MarkdownView.tsx`（渲染 + 链接处理）
- 测试：`tests/unit/markdown-heading-ids.test.ts`
- 备注：wiki 链接支持跳转到工作区内其他文件

### 图片资源加载

- 说明：加载工作区内相对路径和绝对路径的图片资源，转为 blob URL 供渲染
- 入口：`src/renderer/src/components/MarkdownView.tsx:152-231`
- 核心：`src/main/workspace.ts:102-131`（`readWorkspaceAsset`、`readAbsoluteImageFile`）
- 测试：`tests/unit/markdown-images.test.ts`、`tests/unit/workspace-asset.test.ts`

## 主题

### 明暗主题切换

- 说明：应用主题切换（light/dark），持久化到 localStorage，自动检测系统主题偏好
- 入口：`src/renderer/src/hooks/useTheme.ts`
- 核心：`src/renderer/src/hooks/useTheme.ts`、`src/renderer/src/App.css`（`:root` / `[data-theme="dark"]` CSS 变量）

## 终端

### 终端面板

- 说明：底部终端面板，支持拖拽调整高度、显示/隐藏切换
- 入口：`src/renderer/src/components/TerminalPanel.tsx`
- 核心：`src/renderer/src/components/TerminalPanel.tsx`（面板容器 + 拖拽）、`src/renderer/src/components/terminalLayout.ts`（高度计算、主题、fit）
- 测试：`tests/unit/terminal-css.test.ts`、`tests/unit/terminal-layout.test.ts`

### 终端实例

- 说明：单个终端实例，xterm.js 渲染 + node-pty 后端进程，支持 FitAddon 自适应、写入队列、生命周期管理
- 入口：`src/renderer/src/components/TerminalInstance.tsx`（渲染侧）、`src/main/terminal.ts`（主进程 pty 管理）
- 核心：`src/main/terminal.ts`（`createTerminal`、`terminalWrite`、`terminalResize`、`terminalKill`）、`src/renderer/src/components/TerminalInstance.tsx`（xterm 初始化、数据流）
- 测试：`tests/unit/terminal-process-lifecycle.test.ts`、`tests/unit/terminal-cwd.test.ts`

### 终端标签页管理

- 说明：多终端标签页的新建、关闭、切换，最多 10 个标签页
- 入口：`src/renderer/src/hooks/useTerminalTabs.ts`
- 核心：`src/renderer/src/components/terminalTabActions.ts`（纯函数标签页状态管理）、`src/renderer/src/components/TerminalTabs.tsx`（标签栏 UI）、`src/renderer/src/hooks/useTerminalTabs.ts`（Hook 封装）
- 测试：`tests/unit/terminal-tab-actions.test.ts`

## 最近文件夹

### 最近文件夹记录

- 说明：记录最近打开的文件夹列表（最多 15 个），持久化到 JSON 文件
- 入口：`src/main/recent-folders.ts`
- 核心：`src/main/recent-folders.ts`（`addRecentFolder`、`getRecentFolders`、`removeRecentFolder`）
- 备注：存储在 `userData/recent-folders.json`

### Windows Jump List

- 说明：Windows 任务栏 Jump List 显示最近打开的文件夹（最多 10 个），点击可启动新窗口打开对应文件夹
- 入口：`src/main/recent-folders.ts:68-87`（`refreshJumpList`）
- 核心：`src/main/recent-folders.ts`（`refreshJumpList`）

### 欢迎页

- 说明：未打开工作区时显示欢迎页，含"打开文件夹"按钮和最近文件夹列表
- 入口：`src/renderer/src/components/WelcomePage.tsx`
- 核心：`src/renderer/src/components/WelcomePage.tsx`

# Wiki Reader

基于 Electron 的本地 Markdown Wiki 阅读器，提供类似 Typora 的低干扰阅读体验，同时保留源码查看和编辑能力。

[English](./README.md)

## 功能特性

- **Markdown 渲染** — 基于 markdown-it + highlight.js，支持代码语法高亮
- **源码编辑器** — 基于 CodeMirror 6，支持手动保存（Ctrl+S）
- **文件树浏览** — 打开任意文件夹，以树形结构浏览 Markdown 文件
- **标题导航** — 提取文档标题并支持快速跳转
- **内置终端** — 集成 xterm.js + node-pty 终端面板，支持多标签页
- **主题切换** — 明暗主题自由切换，状态持久化到 localStorage
- **多窗口** — 在独立窗口中打开多个文件夹，单实例锁保护
- **欢迎页** — 最近打开的文件夹快速访问，集成 Windows Jump List
- **统一字体** — Maple Mono NF CN 等宽中文字体

## 技术栈

| 技术 | 用途 |
|---|---|
| Electron 33+ | 桌面应用框架 |
| React 18 | UI 渲染 |
| TypeScript 5 | 类型安全 |
| electron-vite | 构建工具链 |
| markdown-it | Markdown 解析与渲染 |
| highlight.js | 代码语法高亮 |
| CodeMirror 6 | 源码编辑器 |
| xterm.js / node-pty | 集成终端 |
| chokidar | 文件系统监听 |
| Vitest | 单元测试 |

## 项目结构

```
wiki-reader/
├── src/
│   ├── main/              # Electron 主进程
│   ├── preload/           # 预加载脚本（contextBridge API）
│   └── renderer/          # 渲染进程（React）
│       └── src/
│           ├── components/    # UI 组件
│           ├── hooks/         # 自定义 React Hooks
│           └── utils/         # 工具函数
├── tests/unit/            # 单元测试（Vitest）
├── resources/             # 字体与图标
├── docs/                  # 设计文档与计划
└── build/                 # 构建资源
```

## 快速开始

### 环境要求

- **Node.js** 18+
- **pnpm** 包管理器
- **Windows 环境**：Visual Studio Build Tools，需勾选"使用 C++ 的桌面开发"工作负载（node-pty 编译所需）
- **Windows 环境**：PATH 中可用的 Python 3.x（node-gyp 所需）
- **Windows 环境**：开启开发者模式（electron-builder 创建符号链接所需）

### 安装与运行

```bash
pnpm install
pnpm dev
```

### 构建

```bash
# Windows 安装包（NSIS .exe）
pnpm build:win

# 解压即用目录（快速验证）
pnpm build:unpack

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### 其他命令

```bash
pnpm test            # 运行单元测试
pnpm test:watch      # 监听模式运行测试
pnpm typecheck       # TypeScript 类型检查
pnpm lint            # ESLint 代码检查
pnpm format          # Prettier 格式化
```

## 截图

> 截图待补充

## 许可证

[MIT](./LICENSE)

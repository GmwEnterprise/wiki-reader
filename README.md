# Wiki Reader

一个本地 Markdown Wiki 阅读器，基于 Electron 构建。专注于**阅读体验**，尤其适用于个人 [llm-wiki](gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 的前端浏览。

> AI 个人知识库方案（如 Karpathy 的 llm-wiki）会生成大量互相链接的 Markdown 文件，需要一个轻量、快速的本地浏览器来阅读和导航。Wiki Reader 正是为此而生。

## 与 Typora 的对比

### 相比 Typora 的优势

| 特性 | Wiki Reader | Typora |
|------|-------------|--------|
| **底部命令行终端** | 内置 xterm.js + node-pty 终端，支持多标签页 | 无 |
| **相对路径链接跳转** | 点击 `[链接](./other.md)` 直接跳转到对应文件 | 支持但体验一般 |
| **多窗口** | 每个文件夹可独立打开一个窗口 | 单窗口 |
| **免费开源** | MIT 协议 | 付费软件 |

### 相比 Typora 的不足

| 特性 | Wiki Reader | Typora |
|------|-------------|--------|
| **即时编辑渲染** | 不支持所见即所得，阅读与源码模式需手动切换 | 核心特性，编辑即渲染 |
| **写作体验** | 编辑器功能较基础，主要用于快速修改而非长文写作 | 完整的 Markdown 写作工具 |

> **设计哲学**：Wiki Reader 是一个**阅读器**，不是编辑器。在 AI 时代，文档的撰写主要由 AI 完成，人类的工作是**阅读、浏览和导航**。因此产品重心放在阅读体验、文件导航和终端集成上，而非编辑能力。

## 功能特性

- **Markdown 渲染** — markdown-it + highlight.js，支持代码语法高亮
- **源码查看与编辑** — 基于 CodeMirror 6 的源码编辑器，手动保存（Ctrl+S）
- **文件树浏览** — 打开任意文件夹，以树形结构浏览 Markdown 文件
- **标题导航** — 自动提取文档标题，快速跳转
- **内置终端** — 底部终端面板，支持多标签页，适合配合 CLI 工具使用
- **明暗主题** — 浅色/深色主题切换，状态持久化
- **多窗口** — 每个文件夹独立窗口，单实例锁
- **欢迎页** — 最近打开的文件夹快速访问，Windows Jump List 集成
- **统一字体** — Maple Mono NF CN

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 33+ | 桌面应用框架 |
| React 18 | UI 渲染 |
| TypeScript 5 | 类型安全 |
| electron-vite | 构建工具 |
| markdown-it | Markdown 解析与渲染 |
| highlight.js | 代码语法高亮 |
| CodeMirror 6 | 源码编辑器 |
| xterm.js / node-pty | 内置终端 |
| chokidar | 文件系统监听 |
| Vitest | 单元测试 |

## 快速开始

### 环境要求

- **Node.js** 18+
- **pnpm** 包管理器
- **Windows**：Visual Studio Build Tools（需勾选"使用 C++ 的桌面开发"工作负载，node-pty 编译所需）
- **Windows**：Python 3.x 在 PATH 中（node-gyp 所需）
- **Windows**：开启开发者模式（electron-builder 符号链接所需）

### 安装与运行

```bash
pnpm install
pnpm dev
```

### 打包

```bash
pnpm build:win     # Windows 安装包（NSIS .exe）
pnpm build:unpack  # 解压即用目录（快速验证）
```

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
└── docs/                  # 设计文档与开发计划
```

## License

[MIT](./LICENSE)

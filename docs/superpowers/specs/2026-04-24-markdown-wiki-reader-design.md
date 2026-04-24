# Markdown Wiki Reader 设计方案

## 背景

本项目是一个本地使用的 Markdown wiki reader，使用 Electron 构建桌面应用。第一版目标是提供类似 Typora 的低干扰阅读体验，同时保留源码查看和手动编辑能力。

项目当前为空目录，因此按全新 Electron 应用设计。

## 目标

- 打开本地文件夹作为 wiki 根目录。
- 单个窗口管理单个文件夹。
- 支持多窗口多实例，每个窗口可打开不同文件夹。
- 左侧支持在文件列表和标题列表之间切换。
- 右侧显示 Markdown 内容，支持渲染显示和源码显示。
- 源码显示支持编辑，并通过手动保存写回文件。
- 支持明暗主题切换。
- 底部支持打开真实命令行。
- Windows 默认打开 PowerShell，Linux 和 macOS 默认打开 bash。
- 终端使用成熟依赖实现，不自行开发终端模拟器。

## 非目标

- 第一版不支持 Mermaid、数学公式等增强 Markdown。
- 第一版不支持自动保存。
- 第一版不支持全文搜索。
- 第一版不支持 Git 集成。
- 第一版不支持多标签页。
- 第一版不提供文件创建、重命名、删除等 wiki 管理功能。

## 推荐技术方案

采用 Electron + React + Vite + CodeMirror 6 + markdown-it + xterm.js + node-pty。

- `electron`：桌面壳、本地文件、窗口、菜单、IPC。
- `vite`：开发和构建。
- `react`：界面渲染和状态管理。
- `markdown-it`：常规 Markdown 渲染。
- `highlight.js`：代码块高亮。
- `@codemirror/*`：Markdown 源码编辑。
- `@xterm/xterm`：终端界面。
- `node-pty`：连接真实 shell。
- `chokidar`：监听文件夹变化并刷新文件树。

选择该方案是为了在实现复杂度和产品体验之间取得平衡。CodeMirror 比普通 textarea 更适合 Markdown 源码编辑，同时比 Monaco 更轻量；xterm.js 和 node-pty 是 Electron 终端集成的成熟组合。

## 窗口模型

- 启动后可以通过欢迎页或菜单打开本地文件夹。
- 一个窗口绑定一个 wiki 根目录。
- 不强制应用单实例，允许多个窗口并行工作。
- 每个 BrowserWindow 维护独立 workspace 状态、当前文档状态和终端实例。
- 窗口关闭时销毁该窗口对应的终端 pty。

## 界面布局

主界面分为顶部工具栏、左侧栏、右侧主内容区和底部终端面板。

- 顶部工具栏：显示当前文件夹名、打开文件夹入口、阅读/源码切换、保存状态、主题切换、终端开关。
- 左侧栏：支持“文件列表”和“标题列表”两种视图切换。
- 右侧主内容区：显示 Markdown 渲染视图或 CodeMirror 源码编辑视图。
- 底部终端面板：默认关闭，打开后显示真实 shell，可拖拽调整高度。
- 空状态：未打开文件夹时显示欢迎页和“打开文件夹”主按钮。

视觉方向：

- 类 Typora 的低干扰阅读区，正文宽度限制在约 `760-860px` 并居中。
- 左侧栏采用笔记目录风格，不做厚重 IDE 风格。
- 亮色主题使用温暖白底，暗色主题使用低对比深灰，不使用纯黑。
- 当前选中文件和当前标题使用淡色背景或细边线强调。
- 终端主体保持深色，外框和标题区域跟随应用主题。

## 模块架构

Electron 主进程负责所有本地能力，渲染进程通过 preload 暴露的安全 API 访问文件和终端能力。

- `main/window`：创建主窗口、处理多窗口、菜单命令。
- `main/workspace`：打开文件夹、扫描 Markdown 文件、读取/保存文件、监听文件变化。
- `main/terminal`：为每个窗口创建独立 pty，并根据平台选择默认 shell。
- `preload/api`：暴露 `openFolder`、`readFile`、`saveFile`、`watchWorkspace`、`createTerminal` 等受控 API。
- `renderer/app`：整体布局、全局状态、主题、当前 workspace。
- `renderer/sidebar`：文件列表和标题列表切换。
- `renderer/markdown`：Markdown 渲染、代码高亮、标题提取。
- `renderer/editor`：CodeMirror 源码编辑、dirty 状态、手动保存。
- `renderer/terminal`：xterm 初始化、尺寸同步、输入输出桥接。
- `renderer/theme`：明暗主题变量和本地持久化。

## 数据边界

- 文件路径只在主进程做合法性校验。
- 渲染进程请求文件时只传相对路径或受控文件标识。
- 主进程确认目标文件位于当前 workspace 内，才允许读取或写入。
- 每个窗口维护自己的 workspace 和终端状态，窗口之间互不影响。

核心数据结构：

```ts
type Workspace = {
  id: string;
  rootPath: string;
  name: string;
};

type WikiFile = {
  relativePath: string;
  name: string;
  mtimeMs: number;
  size: number;
};

type DocumentState = {
  file: WikiFile | null;
  content: string;
  mode: "preview" | "source";
  dirty: boolean;
};

type Heading = {
  id: string;
  level: number;
  text: string;
};
```

## 文件列表

- 递归扫描 workspace 下的 `.md` 和 `.markdown` 文件。
- 忽略 `node_modules`、`.git` 和隐藏缓存目录。
- 文件按目录层级展示。
- 目录优先，文件按名称排序。
- 使用 `chokidar` 监听文件新增、删除和修改，并刷新文件列表。
- 当前打开文件如果被外部修改，提示“文件已在外部变化”，不自动覆盖编辑区内容。

## 标题列表

- 从当前文档 Markdown 源码提取 `#` 到 `######` 标题。
- 渲染视图中为标题生成稳定锚点。
- 点击标题列表滚动到对应标题。
- 源码模式下标题列表仍根据当前编辑内容实时更新。
- 标题列表更新不触发自动保存。

## Markdown 渲染

第一版支持常规 Markdown：

- 标题。
- 列表。
- 表格。
- 代码块。
- 引用。
- 链接。
- 图片。

代码块通过 `highlight.js` 高亮。图片最大宽度不超过正文宽度。外部链接使用系统浏览器打开；本地相对链接如果指向 Markdown 文件，则在当前窗口打开。

## 源码编辑与保存

- 源码模式使用 CodeMirror 6。
- 修改后顶部显示“未保存”。
- `Ctrl+S` 或 `Cmd+S` 保存当前文件。
- 保存成功后状态变为“已保存”。
- 保存失败时保留 dirty 状态并提示错误。
- 从有未保存修改的文件切换到另一个文件时弹出确认，选项为保存、放弃、更正返回。
- 关闭窗口时如果存在未保存修改，也弹出相同确认。
- 第一版不做自动保存，避免误改本地 wiki 文件。

## 主题设计

- 顶部提供明暗主题切换。
- 主题选择持久化到本地配置。
- Markdown 渲染区、侧栏、工具栏和编辑器同步主题。
- 终端主体保持深色，外框和标题区域跟随应用主题。
- 第一版不默认跟随系统主题，后续可扩展。

## 终端设计

- 底部“终端”按钮打开或隐藏终端面板。
- 每个窗口最多一个终端实例。
- 终端启动目录为当前 workspace 根目录。
- Windows 默认 shell 为 `powershell.exe`。
- Linux 和 macOS 默认 shell 为 `bash`。
- 使用 `node-pty` 启动真实 shell，用 xterm 显示和交互。
- 面板高度可拖拽，窗口 resize 时同步调整终端尺寸。
- 隐藏终端面板不销毁终端。
- 用户点击终端关闭按钮时销毁 pty。
- 窗口关闭时销毁对应 pty。

## 错误处理

- 打开文件夹失败：显示提示，并保留当前状态。
- 文件读取失败：右侧显示错误空状态，并提供重试入口。
- 保存失败：保留 dirty 状态，提示错误。
- 当前文件被删除：提示文件不存在，并回到未选中文档状态。
- pty 启动失败：终端区域显示错误，提示检查 shell 是否存在。
- Markdown 渲染失败：显示源码降级视图，避免白屏。

## 测试与验收

第一版成功标准：

- 能在 Windows、Linux 和 macOS 打开本地文件夹并展示 Markdown 文件列表。
- 点击文件能渲染常规 Markdown。
- 能切换源码模式、编辑内容，并通过快捷键手动保存。
- 左侧能在文件列表和标题列表之间切换。
- 能切换明暗主题并保持选择。
- 能打开底部终端，Windows 默认 PowerShell，Linux 和 macOS 默认 bash。
- 多窗口可以分别打开不同文件夹，状态互不影响。

建议测试：

- 单元测试：标题提取、Markdown 链接解析、路径安全校验。
- 集成测试：IPC 文件读取保存、workspace 扫描、终端 shell 选择。
- 端到端手测：打开文件夹、切换文件、编辑保存、主题切换、终端输入命令、多窗口隔离。

## 范围控制

本设计聚焦第一版可用 reader。后续可以在该基础上扩展全文搜索、文件管理、增强 Markdown、同步滚动、最近打开目录、系统主题跟随等能力，但这些都不进入第一版实现范围。

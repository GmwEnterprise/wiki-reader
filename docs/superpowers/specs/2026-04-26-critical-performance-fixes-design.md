# 严重性能问题修复设计

日期：2026-04-26

## 背景

`docs/performance-review/critical-risks.md` 列出了 4 个严重风险：终端大量输出无背压、多窗口终端 ID 冲突、源码编辑每次输入同步整篇文档、文件监听触发全量扫描风暴。本次修复只覆盖这些严重风险，不处理高风险和中低风险建议。

## 目标

- 终端输出链路具备批处理、缓冲上限和 xterm 串行写入能力。
- 多窗口终端实例按窗口隔离，避免同 ID 标签互相影响。
- 源码编辑时不再每次按键把整篇文档同步到 React state。
- 工作区 watcher 合并结构变更事件，避免频繁全量扫描和旧结果覆盖新结果。

## 非目标

- 不引入文件树虚拟化、图片 Blob URL 缓存或 Markdown 渲染优化。
- 不重构终端、文档、工作区为新的大型状态管理层。
- 不改变保存快捷键、预览/源码切换方式和现有 IPC 对外语义。

## 方案

### 终端输出背压

`src/main/terminal.ts` 中的每个终端 entry 增加输出缓冲、flush timer 和截断标记。PTY `onData` 只追加缓冲，不直接发送 IPC。主进程以约 32ms 周期合并输出后发送到所属窗口。单终端待发送缓冲上限为 2MB，超过上限时丢弃旧内容并追加提示文本：`\r\n[输出过快，已截断部分内容]\r\n`。

`src/renderer/src/components/TerminalInstance.tsx` 维护 xterm 写入队列。收到 `terminal:data` 后只入队；只有上一批 `xterm.write` callback 完成后才写下一批。队列也设置 2MB 上限，超过后丢弃旧输出并插入同样的截断提示。组件卸载、终端重建或退出时清空队列。

### 多窗口终端隔离

`ptyInstances` 从 `Map<number, PtyEntry>` 改为 `Map<string, PtyEntry>`，key 格式为 `${windowId}:${terminalId}`。`terminal:create`、`terminal:write`、`terminal:resize`、`terminal:kill` 都由 IPC handler 根据 `event.sender` 获取窗口 ID，再传给 terminal 模块。数据和退出事件仍使用创建时绑定的 `BrowserWindow` 回发，只回到所属窗口。

### 编辑器输入链路

`SourceEditor` 使用 `forwardRef` 和 `useImperativeHandle` 暴露 `getContent()`。`onChange(value)` 改为 `onDirty()`，CodeMirror update listener 在 `docChanged` 时只通知 dirty，不调用 `toString()`。

`useDocument` 增加 `markDirty()` 和 `saveContent(content)`。保存时由 `App` 从编辑器 ref 获取全文并传入 `saveContent`。切换到预览前同步一次编辑器内容到 `doc.content`，保证 Markdown 预览显示最新内容。打开其他文件、关闭工作区、窗口关闭前沿用 `flushSave`，但由 `App` 提供当前编辑器内容。

### 文件监听与扫描

`watchWorkspace` 对 chokidar 事件做 debounce。`add` 和 `unlink` 属于结构变更，合并后发送 `workspace:filesChanged`；`change` 只记录但不刷新文件树，避免当前文件保存触发整棵树重建。

`useWorkspace.refreshFiles` 增加扫描序号，每次扫描前递增，扫描完成后只有最新序号允许 `setFiles`，避免并发扫描乱序覆盖。

## 测试与验证

WSL2 环境不运行 `pnpm` 脚本。实现后建议在 Windows 宿主机执行：

```bash
pnpm test
pnpm build
pnpm dev
```

手工验收：

- 打开两个窗口，每个窗口创建终端 1，输入和关闭互不影响。
- 连续输出命令运行时窗口可切换、关闭、输入，内存不持续无上限增长。
- 20MB Markdown 源码模式输入时，按键不触发 Markdown 预览和标题提取。
- 源码保存后内容正确，切换预览显示最新内容。
- 批量新增或删除 Markdown 文件只触发合并后的文件树刷新，保存当前文件不反复重建文件树。

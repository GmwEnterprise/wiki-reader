# 中低风险修复建议书

## 风险 1：重复打开同一路径可能覆盖 watcher

### 关键位置

- `src/main/workspace.ts:120-132`
- `src/main/workspace.ts:134-140`

### 问题说明

`watchWorkspace(rootPath)` 每次都会创建新的 `chokidar` watcher，然后 `watchers.set(rootPath, watcher)`。如果同一路径已经存在 watcher，旧 watcher 没有先关闭，可能丢失引用并继续运行。

### 建议方案

1. `watchWorkspace` 开头检查 `watchers.get(rootPath)`。
2. 如果存在旧 watcher，先 `close()` 并从 Map 删除。
3. 多窗口需要同时观察同一路径时，使用 `windowId + rootPath` 或引用计数管理。

### 验收标准

- 重复打开同一目录不会产生多个 watcher。
- 关闭 workspace 后 watcher 被释放。
- 多窗口同目录场景不会互相取消监听。

## 风险 2：终端输入使用 `ipcRenderer.invoke` 成本偏高

### 关键位置

- `src/preload/index.ts:64-67`
- `src/renderer/src/components/TerminalInstance.tsx:94-96`
- `src/main/ipc-handlers.ts:118-121`

### 问题说明

终端输入每次通过 `ipcRenderer.invoke('terminal:write')` 发送，会为每次输入创建 Promise。普通键入影响有限，但大段粘贴或高频交互时有额外 IPC 往返和微任务开销。

### 建议方案

1. 将 `terminalWrite` 从 `invoke` 改为 `send`。
2. 主进程使用 `ipcMain.on('terminal:write')` 接收。
3. 对大段粘贴按块合并发送。
4. 如果需要错误反馈，仅在终端不存在时发送一次错误事件，不必每次输入返回布尔值。

### 验收标准

- 普通输入、粘贴、多字节字符输入正常。
- 粘贴大段文本时 UI 不明显卡顿。
- 终端关闭后输入不会抛出未处理异常。

## 风险 3：后台终端标签持续接收并写入输出

### 关键位置

- `src/renderer/src/components/TerminalPanel.tsx:69-80`
- `src/renderer/src/components/TerminalInstance.tsx:172-177`

### 问题说明

所有终端标签对应的 `TerminalInstance` 都保持挂载。非活动标签只是 `display:none`，其 PTY、IPC listener 和 xterm 实例仍持续接收输出。

### 建议方案

1. 对非活动标签降低写入频率。
2. 对隐藏终端面板时的输出设置更低 flush 频率。
3. 在 UI 上区分“隐藏面板”和“关闭终端”。
4. 提供“关闭所有终端”入口。

### 验收标准

- 多个后台标签运行输出任务时，活动标签仍流畅。
- 隐藏终端面板后资源消耗可控。
- 用户能明确释放终端资源。

## 风险 4：终端快速创建/关闭时 pending 回调缺少完整失效保护

### 关键位置

- `src/renderer/src/components/TerminalInstance.tsx:47-56`
- `src/renderer/src/components/TerminalInstance.tsx:117-125`
- `src/renderer/src/components/TerminalInstance.tsx:162-170`

### 问题说明

`terminalCreate(...).then(...)` 使用 `generationRef` 校验，但 `destroyTerminal` 没有主动递增 generation。快速创建、关闭、切换 workspace 时，仍可能出现卸载后异步回调进入旧逻辑的边界风险。

### 建议方案

1. 在 `destroyTerminal` 或卸载 cleanup 中递增 `generationRef.current`。
2. `terminalKill` 后在本地标记 disposed。
3. 主进程 flush 输出前检查终端仍有效。

### 验收标准

- 快速新建并关闭终端不会出现 React 状态更新警告。
- 关闭后的终端不会继续追加输出。
- 切换 workspace 后旧终端不会复活。

## 风险 5：文件树刷新时存在扫描结果乱序回写

### 关键位置

- `src/renderer/src/hooks/useWorkspace.ts:8-11`
- `src/renderer/src/hooks/useWorkspace.ts:52-60`

### 问题说明

`refreshFiles` 每次调用都会异步扫描并直接 `setFiles(scannedFiles)`。如果多个扫描并发执行，较早请求可能较晚返回，从而覆盖较新的文件树状态。

### 建议方案

1. 在 `useWorkspace` 中增加 `scanSeqRef`。
2. 每次刷新递增序号。
3. 扫描完成后只允许最新序号落地。
4. 如果已有扫描正在进行，记录 pending 标记，完成后只补扫一次。

### 验收标准

- 快速连续文件变化后，文件树最终状态正确。
- 不会出现已删除文件重新出现的短暂回退。

## 风险 6：局部低成本优化项

### 关键位置

- `src/renderer/src/App.tsx:85-93`
- `src/renderer/src/hooks/useHeadings.ts:27-30`
- `src/renderer/src/components/MarkdownView.tsx:137-150`

### 问题说明

存在一些单点成本不高、但在大数据量下会放大的逻辑：

- 文件列表刷新时用 `files.some` 检查当前文件是否存在。
- 标题观察逐个 `querySelector`。
- 图片 src 收集在同一 effect 内重复执行。

### 建议方案

1. 在 `useWorkspace` 中维护 `Set<relativePath>` 供存在性检查。
2. 标题观察改为一次 `querySelectorAll('h1,h2,h3,h4,h5,h6')` 后按 id 匹配。
3. `MarkdownView` 中复用 `collectLocalImageSrcs(renderedHtml)` 的结果。

### 验收标准

- 大文件列表刷新时主界面无明显卡顿。
- 大量标题文档进入预览后观察器初始化更快。
- 多图片文档加载时减少重复 HTML 扫描。

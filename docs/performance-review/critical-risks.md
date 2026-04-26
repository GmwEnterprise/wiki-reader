# 严重风险修复建议书

## 风险 1：多终端大量输出无背压

### 关键位置

- `src/main/terminal.ts:92-96`
- `src/renderer/src/components/TerminalInstance.tsx:100-103`
- `src/preload/index.ts:72-78`

### 问题说明

PTY 的每个 stdout/stderr chunk 都直接通过 `webContents.send('terminal:data')` 发送到渲染进程，渲染侧收到后立即调用 `xterm.write(data)`。当前没有批处理、限流、最大缓冲、写入队列或背压策略。

### 可能后果

- 长程命令持续输出时，主进程 IPC 事件持续堆积。
- xterm 渲染速度低于输出速度时，渲染进程内存持续上涨。
- 多个后台标签同时输出时，CPU、内存和 IPC 压力线性放大。
- 用户隐藏终端面板后，后台任务仍持续产生输出，资源消耗不直观。

### 修复目标

- 主进程输出按终端缓冲并批量发送。
- 渲染侧串行写入 xterm，避免无限写入队列。
- 为每个终端设置最大缓冲上限。
- 后台终端标签降低写入频率或只缓存有限输出。

### 建议方案

1. 在 `src/main/terminal.ts` 为每个终端增加输出缓冲。
2. 使用 16-32ms flush 周期合并多个输出 chunk。
3. 设置单终端缓冲上限，例如 1-4MB。
4. 超过上限时丢弃旧输出，并追加提示文本：`\r\n[输出过快，已截断部分内容]\r\n`。
5. 在 `TerminalInstance.tsx` 中引入 xterm 写入队列，只有上一批 `xterm.write` callback 完成后再写下一批。
6. 为后台标签或隐藏面板状态降低 flush 频率，或只保留有限缓冲。

### 验收标准

- 运行持续输出命令 10 分钟，渲染进程内存不应持续无上限增长。
- 同时打开 3 个终端标签执行大量输出命令，窗口仍可响应切换、关闭和输入。
- 关闭终端标签后，该终端不再收到残余输出。

## 风险 2：多窗口终端 ID 全局冲突

### 关键位置

- `src/main/terminal.ts:26-28`
- `src/main/terminal.ts:73-75`
- `src/main/terminal.ts:115-147`
- `src/renderer/src/hooks/useTerminalTabs.ts:29-35`

### 问题说明

主进程 `ptyInstances` 使用数字 `terminalId` 作为全局 key，但每个窗口的终端 ID 都从 `1` 开始。多窗口同时打开终端时，不同窗口会产生相同终端 ID。

### 可能后果

- 第二个窗口的终端可能创建失败。
- 写入、resize、kill 操作可能作用到另一个窗口的终端。
- 窗口关闭时可能清理错误终端，导致任务残留或被误杀。

### 修复目标

- 主进程终端实例使用复合 key 管理。
- 所有终端 IPC 操作都校验请求来源窗口。
- 终端数据和退出事件只回发给所属窗口。

### 建议方案

1. 将 `ptyInstances` 的 key 从 `number` 改为字符串复合 key，例如 `${windowId}:${terminalId}`。
2. `terminal:create` 通过 `BrowserWindow.fromWebContents(event.sender)` 获取 `windowId`。
3. `terminal:write`、`terminal:resize`、`terminal:kill` 同样通过事件来源获取 `windowId`。
4. `terminalWrite`、`terminalResize`、`terminalKill` 签名增加 `windowId` 参数。
5. `onData` 和 `onExit` 只使用创建时绑定的 `win.webContents.send` 回发。
6. `killWindowTerminals(windowId)` 按复合 key 或 entry.windowId 清理。

### 验收标准

- 打开两个窗口，每个窗口创建终端 ID 为 1 的标签，两个终端都能正常工作。
- 在窗口 A 输入命令不会影响窗口 B。
- 关闭窗口 A 不会杀掉窗口 B 的终端。
- 窗口 B 的终端仍能继续输出和关闭。

## 风险 3：编辑器每次输入同步整篇文档到 React state

### 关键位置

- `src/renderer/src/components/SourceEditor.tsx:58-61`
- `src/renderer/src/components/SourceEditor.tsx:110-120`
- `src/renderer/src/hooks/useDocument.ts:78-89`

### 问题说明

CodeMirror 每次文档变化都会执行 `update.state.doc.toString()`，把整篇文档转换为字符串并传入 React state。`useDocument` 随后把完整内容写入 `doc.content`，并与 `originalContent` 做全文比较。

### 可能后果

- 长文档每次输入都复制整篇文本，CPU 和 GC 压力大。
- React state 高频更新导致 `App`、标题提取、侧栏等相关逻辑重复执行。
- 大文档连续输入时可能出现明显输入延迟和内存抖动。

### 修复目标

- 编辑态避免每次按键同步全文。
- React 只维护 dirty、当前文件、模式等元数据。
- 保存或切换预览时再从 CodeMirror 读取全文。

### 建议方案

1. `SourceEditor` 暴露获取当前内容的能力，或由父组件持有 editor ref。
2. `onChange` 不再传完整字符串，只通知 `dirty=true`。
3. `flushSave` 保存时从 CodeMirror 读取当前全文。
4. 切换到预览前同步一次内容，再触发 Markdown 渲染。
5. `dirty` 使用布尔标记或版本号，不再每次与 `originalContent` 全文比较。
6. 如果短期不重构，可先使用 debounce 降低同步频率。

### 验收标准

- 20MB Markdown 文件源码模式输入时，不应每个按键触发完整 Markdown 渲染或标题提取。
- 连续输入 1 分钟，CPU 不应长期满载，内存不应持续单调上涨。
- 保存后内容正确写入文件。
- 切换预览后显示最新内容。

## 风险 4：文件监听触发全量扫描风暴

### 关键位置

- `src/main/workspace.ts:120-132`
- `src/main/ipc-handlers.ts:98-104`
- `src/renderer/src/hooks/useWorkspace.ts:52-60`

### 问题说明

`chokidar` 的 `add`、`unlink`、`change` 每个事件都会发送 `workspace:filesChanged`。渲染进程收到后调用 `scanFiles(rootPath)`，主进程重新递归扫描整个目录。

### 可能后果

- 大目录中批量文件变化会触发大量全量扫描。
- 多个扫描并发执行，结果可能乱序回写。
- 主进程 IO、CPU、渲染进程结构化克隆和 React 渲染压力升高。

### 修复目标

- watcher 事件合并发送。
- 避免并发扫描。
- 对内容变更和结构变更区别处理。

### 建议方案

1. 在主进程 watcher 回调中增加 debounce，例如 300-1000ms。
2. 合并事件时记录事件类型和路径集合。
3. `change` 事件不刷新文件树，只在当前打开文件需要时提示或重载。
4. `add` 和 `unlink` 再触发文件树刷新。
5. `useWorkspace.refreshFiles` 增加扫描序号，只允许最后一次结果落地。
6. 长期改为主进程维护文件索引，并向渲染进程发送增量变更。

### 验收标准

- 批量新增或删除 1,000 个 Markdown 文件时，不应触发 1,000 次全量扫描。
- 快速连续文件变化时，最终文件树状态正确。
- 当前文件保存不应导致文件树反复重建。

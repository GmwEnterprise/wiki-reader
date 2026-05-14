# Design: open-file

## Goal

支持打开单个 Markdown 文件（非文件夹），提供完整的阅读和编辑体验。

## Scope

### In

1. 左上角菜单"打开文件夹"前面新增"打开文件"选项
2. 打开单独文件时，底部终端 CWD 为用户 home 目录（与未打开文件夹时一致）
3. 打开单独文件时，左侧侧栏隐藏"文件"标签页，只显示"标题"标签页
4. 最近打开列表区分文件和文件夹（图标区分），支持从列表打开单独文件

### Out

- 不支持将文件拖拽到窗口打开（未要求）
- 单独文件模式下同样监听外部修改（非 workspace watch，而是单文件 watch）
- 不支持打开非 Markdown 文件（过滤对话框只显示 .md/.markdown）

## Assumptions

- 打开单独文件时不设置 workspace，`workspaceRootPath` 仍为 null
- 单独文件的保存逻辑需要独立处理（不依赖 workspace 的 validatePath）
- 单独文件模式下不显示"关闭文件夹"菜单项，改为"关闭文件"

## Current Behavior

- 只能通过"打开文件夹"打开一个目录作为工作区
- 侧栏固定显示"文件"和"标题"两个标签页
- 最近打开列表只记录文件夹路径，无类型区分
- Jump List 通过 `--open` 参数传递路径，`workspace:openPath` 统一处理
- 终端 CWD 使用 `workspace?.rootPath`

## Proposed Behavior

### 1. 新增"打开文件"菜单项

在 `App.tsx` 工具栏菜单中，"打开文件夹"前面增加"打开文件"按钮。点击后弹出文件选择对话框（过滤 .md/.markdown），选择后直接加载文件内容进入阅读视图。

### 2. 文件模式下的 Workspace 模型

引入一个新的状态概念：`singleFile` 模式。当打开单独文件时：
- `workspace` 仍为 null（不设置工作区）
- 新增 `singleFile` 状态，记录当前打开的单独文件绝对路径和文件名
- 文件读写直接使用绝对路径，不经过 workspace 的 relativePath
- appShell 的 `getWorkspaceShellState` 增加 singleFile 判断

### 3. 侧栏只显示"标题"

当处于 singleFile 模式时，Sidebar 隐藏"文件"标签页，默认选中"标题"。

### 4. 最近打开列表

- `RecentFolder` 类型扩展为 `RecentItem`，增加 `type: 'file' | 'folder'` 字段
- 欢迎页最近列表用图标区分文件和文件夹
- Jump List 通过图标区分文件和文件夹（Windows Jump List 的 `iconPath` 字段）
- 点击最近列表中的文件项时，走 singleFile 打开流程

### 5. 文件读写

单独文件的读写需要新的 IPC 通道：
- `workspace:openFileDialog` — 打开文件选择对话框
- `workspace:readFileByPath` — 按绝对路径读取文件
- `workspace:saveFileByPath` — 按绝对路径保存文件
- `workspace:readAssetByPath` — 按绝对路径读取图片资源（用于渲染相对路径图片）

### 6. 终端 CWD

单独文件模式下 `workspaceRoot` 为 null，终端 CWD 自然为 home 目录，无需特殊处理。

### 7. 文件监听

单独文件模式下监听单个文件的外部修改：
- 主进程通过 chokidar（或 `fs.watch`）监听该文件的变化
- 新增 `workspace:watchFile` / `workspace:unwatchFile` IPC 通道
- 文件内容变化时通过 `workspace:singleFileContentChanged` 事件通知渲染进程
- 渲染进程收到通知后，如果文档未脏则自动刷新内容

## Implementation Direction

### 主进程变更

1. **workspace.ts**：新增 `openFileDialog()`（只允许选 .md/.markdown）、`readFileByPath()`、`saveFileByPath()`、`watchSingleFile()`、`unwatchSingleFile()`
2. **ipc-handlers.ts**：注册 `workspace:openFileDialog`、`workspace:readFileByPath`、`workspace:saveFileByPath`、`workspace:watchFile`、`workspace:unwatchFile` handler
3. **recent-folders.ts**：`RecentFolder` → `RecentItem`，增加 `type` 字段；新增 `addRecentFile()`；Jump List 区分文件和文件夹图标

### 预加载层变更

4. **preload/index.ts**：暴露 `openFileDialog()`、`readFileByPath()`、`saveFileByPath()`、`watchSingleFile()`、`unwatchSingleFile()`、`onSingleFileContentChanged()` API

### 渲染进程变更

5. **types.ts**：新增 `SingleFileState` 类型
6. **appShell.ts**：`getWorkspaceShellState` 增加 singleFile 参数判断
7. **App.tsx**：
   - 新增 `singleFile` 状态
   - 新增 `handleOpenFile`（打开文件对话框流程）
   - 新增 `handleOpenRecentItem`（区分文件/文件夹的最近打开处理）
   - 菜单增加"打开文件"按钮
   - singleFile 模式下显示 workspace 视图（但侧栏只有标题）
   - 保存逻辑区分 workspace 模式和 singleFile 模式
8. **Sidebar.tsx**：接收 `showFileTab` prop，singleFile 模式下隐藏文件标签
9. **WelcomePage.tsx**：最近列表增加文件/文件夹图标区分，支持打开文件
10. **useDocument.ts**：支持无 workspaceRootPath 时按绝对路径读写

### 关键决策

- **保存路径**：singleFile 模式下，doc.file.relativePath 存放绝对路径，saveFile 走新的 `workspace:saveFileByPath` IPC
- **图片加载**：singleFile 模式下图片基准路径为文件所在目录，通过 `workspace:readAssetByPath` 或 `workspace:readAbsoluteAsset` 加载

## Affected Files

- `src/main/workspace.ts` (route-map): 新增 openFileDialog, readFileByPath, saveFileByPath
- `src/main/ipc-handlers.ts` (route-map): 注册新 IPC handler
- `src/main/recent-folders.ts` (route-map): RecentItem 类型、addRecentFile、Jump List 图标区分
- `src/preload/index.ts` (route-map): 暴露新 API
- `src/renderer/src/types.ts` (route-map): 新增 SingleFileState
- `src/renderer/src/appShell.ts` (route-map): shell state 增加 singleFile 判断
- `src/renderer/src/App.tsx` (route-map): 菜单、状态管理、保存逻辑
- `src/renderer/src/components/Sidebar.tsx` (route-map): 隐藏文件标签
- `src/renderer/src/components/WelcomePage.tsx` (route-map): 图标区分、打开文件
- `src/renderer/src/hooks/useDocument.ts` (route-map): 绝对路径读写
- `src/renderer/src/components/MarkdownView.tsx` (route-map): 图片路径处理

## Risks

- `useDocument` 的 `workspaceRootPath` 参数为 null 时需确保所有读写路径正确
- 最近文件夹存储格式变更（增加 type 字段）需向后兼容旧数据（默认 type='folder'）
- 单独文件模式下图片相对路径解析需要特殊处理（基准路径为文件所在目录而非 workspace root）

## Test Strategy

- 手动验证：打开文件 → 阅读 → 编辑 → 保存 → 切换模式
- 手动验证：最近列表显示文件/文件夹图标，点击可正确打开
- 手动验证：Jump List 区分文件/文件夹
- 单元测试：RecentItem 向后兼容性、openFileDialog 过滤逻辑
- 手动验证：外部编辑器修改已打开的单文件 → 自动刷新内容

## RouteSpec Impact

- Need route-sync: yes
- Affected routes: 工作区管理、侧栏容器、最近文件夹记录、Windows Jump List、欢迎页、文档加载与保存

## Acceptance Criteria

1. 菜单中有"打开文件"选项，位于"打开文件夹"前面
2. 选择 .md 文件后进入阅读视图，可切换源码编辑，可保存
3. 单独文件模式下侧栏只显示"标题"标签页
4. 单独文件模式下终端 CWD 为 home 目录
5. 最近列表用图标区分文件和文件夹
6. 点击最近列表中的文件项可正确打开
7. Jump List 用图标区分文件和文件夹

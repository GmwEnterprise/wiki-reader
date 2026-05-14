# Execution Plan: open-file

## Summary

支持打开单个 Markdown 文件，涉及主进程文件读写/监听、IPC 通道、最近列表类型扩展、渲染进程状态管理和 UI 适配。

## Tasks

- [ ] T1: 类型和数据模型基础
  - Files: `src/renderer/src/types.ts`, `src/main/recent-folders.ts`
  - Change:
    - types.ts 新增 `SingleFileState` 类型（`absolutePath`, `name`, `dirPath`）
    - recent-folders.ts: `RecentFolder` → `RecentItem`，增加 `type: 'file' | 'folder'` 字段
    - 新增 `addRecentFile()` 函数
    - `readFromDisk()` 对旧数据无 type 字段时默认 `'folder'`（向后兼容）
    - `getRecentFolders()` → `getRecentItems()`，不过滤文件类型
    - Jump List `refreshJumpList()` 区分文件/文件夹图标（shell32.dll 不同 iconIndex）
  - Verify: 类型编译通过
  - Depends on: none

- [ ] T2: 主进程文件操作与监听
  - Files: `src/main/workspace.ts`
  - Change:
    - 新增 `openFileDialog()`: 弹出文件选择对话框，filters 限定 `.md/.markdown`，返回 `{ absolutePath, name, dirPath } | null`
    - 新增 `readFileByPath(absolutePath)`: 按绝对路径读取文件内容
    - 新增 `saveFileByPath(absolutePath, content)`: 按绝对路径保存，校验扩展名
    - 新增 `watchSingleFile(absolutePath, onChange)`: 用 chokidar 监听单文件变化
    - 新增 `unwatchSingleFile(absolutePath, onChange)`: 取消监听
  - Verify: 类型编译通过
  - Depends on: none

- [ ] T3: IPC handlers + preload 桥接
  - Files: `src/main/ipc-handlers.ts`, `src/preload/index.ts`
  - Change:
    - ipc-handlers.ts 注册:
      - `workspace:openFileDialog` → 调用 openFileDialog()
      - `workspace:readFileByPath` → 调用 readFileByPath()
      - `workspace:saveFileByPath` → 调用 saveFileByPath()
      - `workspace:watchFile` → 调用 watchSingleFile()
      - `workspace:unwatchFile` → 调用 unwatchSingleFile()
      - `workspace:openPath` 增加 stat 判断，返回 `{ type: 'file'|'folder', ... }`
      - `recent:getList` → getRecentItems()
      - `recent:addFile` → addRecentFile()
    - preload/index.ts 暴露:
      - `openFileDialog()`
      - `readFileByPath(path)`
      - `saveFileByPath(path, content)`
      - `watchSingleFile(path)`
      - `unwatchSingleFile(path)`
      - `onSingleFileContentChanged(callback)`
      - `addRecentFile(path, name)` (如需要从渲染进程调用)
  - Verify: 类型编译通过
  - Depends on: T1, T2

- [ ] T4: 渲染进程核心逻辑
  - Files: `src/renderer/src/appShell.ts`, `src/renderer/src/hooks/useDocument.ts`, `src/renderer/src/components/Sidebar.tsx`
  - Change:
    - appShell.ts: `getWorkspaceShellState(hasWorkspace, singleFile, initialOpenPath)` — 增加 singleFile 参数，有 singleFile 时返回 `'workspace'`
    - useDocument.ts:
      - `loadContent` 支持 workspaceRootPath 为 null 时用 `readFileByPath`
      - `saveCurrentDoc` 支持 workspaceRootPath 为 null 时用 `saveFileByPath`
      - 移除 `loadContent` 中 `if (!workspaceRootPath) return` 的守卫（改为分支处理）
    - Sidebar.tsx: 新增 `showFileTab: boolean` prop，为 false 时隐藏文件标签，默认选中标题
  - Verify: 类型编译通过
  - Depends on: T3

- [ ] T5: App.tsx 主界面集成
  - Files: `src/renderer/src/App.tsx`
  - Change:
    - 新增 `singleFile` 状态（`SingleFileState | null`）
    - 新增 `handleOpenSingleFile()` 回调：打开文件对话框 → 设置 singleFile → loadContent
    - 修改 `handleOpenRecent()` → `handleOpenRecentItem(path, type)` 区分文件/文件夹
    - 修改 `workspace:openPath` 的返回处理，根据 type 走不同流程
    - 菜单增加"打开文件"按钮（"打开文件夹"前面）
    - singleFile 模式下菜单显示"关闭文件"（替代"关闭文件夹"）
    - Sidebar 传入 `showFileTab={!singleFile}`
    - `effectiveRootPath` 计算：`workspace?.rootPath ?? singleFile?.dirPath ?? null`，传给 MarkdownView 和 TerminalPanel 的 workspaceRootPath
    - singleFile 模式下的外部修改监听：watchSingleFile + onSingleFileContentChanged
    - singleFile 模式下 files 传空数组给 MarkdownView
    - `handleCloseWorkspace` / `handleCloseSingleFile` 分别处理
  - Verify: 完整功能测试
  - Depends on: T4

- [ ] T6: 欢迎页更新
  - Files: `src/renderer/src/components/WelcomePage.tsx`
  - Change:
    - `RecentFolder` → `RecentItem`（含 type 字段）
    - 最近列表每项增加文件/文件夹图标（SVG 内联）
    - 点击回调传递 `type` 信息，支持打开单文件
    - 增加"打开文件"按钮
    - `onOpenRecent(path)` → `onOpenRecent(path, type)` 或由父组件判断
  - Verify: 欢迎页图标和交互
  - Depends on: T1

- [ ] T7: Route sync
  - Files: `docs/routespec/feature-routes.md`
  - Change: 更新功能路由图，增加单文件模式相关条目
  - Depends on: T5, T6

## Verification

- Commands: `pnpm build`（类型检查 + 编译，需在宿主机执行）
- Manual checks:
  1. 菜单"打开文件" → 选择 .md → 进入阅读视图 → 编辑 → 保存
  2. 单独文件模式侧栏只有"标题"标签
  3. 终端 CWD 为 home 目录
  4. 最近列表文件/文件夹图标区分
  5. 从最近列表点击文件项可正确打开
  6. 外部修改已打开的单文件 → 自动刷新
  7. Jump List 图标区分

## Task Relationships

- Strongly related:
  - T1 + T2 + T3 (主进程全链路：类型 → 函数 → IPC 注册 → preload 暴露，需连续完成)
  - T4 + T5 (渲染进程：hooks 变更后 App.tsx 集成需连续完成)
- Weakly related:
  - T1 → T6 (T6 只依赖 RecentItem 类型，可独立于 T4/T5)
- Independent: T7 (所有功能完成后执行)
- Conflict risks:
  - T3 和 T4 都涉及 `workspace:openPath` 返回值结构变更，需协调

## RouteSync

- Need route-sync: yes
- Expected updates: 新增"单文件模式"模块条目，更新最近文件夹/侧栏/文档相关条目

## Risks

- `workspace:openPath` 返回值结构变更需确保渲染进程和主进程同步更新
- Jump List shell32.dll iconIndex 可能因 Windows 版本不同而有差异

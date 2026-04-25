# Windows 任务栏增强 + 最近文件夹 + 应用名称统一

## 背景

Wiki Reader 已完成 7 个阶段的核心功能开发。现需增强 Windows 任务栏体验、支持最近文件夹快速访问，并统一应用名称。

## 需求

1. **任务栏多窗口预览显示文件夹名称** — 当打开多个 Wiki 窗口时，Windows 任务栏悬停预览能区分各窗口对应的工作区
2. **右键任务栏打开最近文件夹** — Windows Jump List 和 macOS Dock 菜单支持快速重新打开最近的工作区
3. **应用名称统一** — `package.json` 元数据更新为 Wiki Reader

## 设计

### 1. 窗口标题动态更新

**目标**：打开工作区后窗口标题变为 `文件夹名 - Wiki Reader`，空窗口保持 `Wiki Reader`。

**实现**：
- `workspace:openFolder` IPC handler 完成后，通过 `BrowserWindow.fromWebContents(event.sender)?.setTitle(name + ' - Wiki Reader')` 更新标题
- 不需要新增 IPC 通道，直接在主进程侧处理
- Electron 会自动将 `BrowserWindow` 的 `title` 反映到 Windows 任务栏预览和 Alt+Tab 切换器

### 2. 最近文件夹管理

**新建模块** `src/main/recent-folders.ts`：

- 存储路径：`app.getPath('userData')/recent-folders.json`
- 数据结构：
  ```typescript
  type RecentFolder = {
    path: string
    name: string
    lastAccessed: number // Unix timestamp ms
  }
  ```
- 最多保留 15 条，按 `lastAccessed` 降序排列
- API：
  - `addRecentFolder(path: string, name: string): void` — 添加或更新条目，同时调用 `app.addRecentDocument(path)` 同步到系统最近列表
  - `getRecentFolders(): RecentFolder[]` — 读取列表
  - `removeRecentFolder(path: string): void` — 移除条目
  - `refreshJumpList(): void` — 调用 `app.setJumpList()` 刷新 Windows Jump List（非 Windows 平台跳过）

**Jump List 配置**（仅 Windows）：
- 类型：`custom` category "最近打开"
- 每个 item 的 `args` 设为 `--open <path>`，便于 `second-instance` 事件捕获
- 最多显示 10 个

**系统最近列表同步**：
- `app.addRecentDocument(path)` — Windows 写入 Jump List "Recent" 类别，macOS 写入 Dock "Open Recent" 菜单
- `app.clearRecentDocuments()` — 仅在清理所有记录时调用

### 3. 单实例锁

当前应用没有单实例锁。Jump List 点击启动新实例时无法在已有实例中打开文件夹。

**实现**：
- 在 `app.whenReady()` 之前调用 `app.requestSingleInstanceLock()`
- 若获取锁失败（已有实例运行），直接 `app.quit()`
- 注册 `app.on('second-instance', (_event, argv) => ...)` 处理器：
  - 解析 `argv` 中的 `--open <path>` 参数
  - 聚焦最后一个窗口或创建新窗口
  - 通知该窗口打开指定路径

### 4. IPC 通道扩展

新增通道：

| 通道 | 方向 | 说明 |
|------|------|------|
| `recent:getList` | renderer → main (invoke) | 返回 `RecentFolder[]` |
| `recent:openFolder` | renderer → main (invoke) | 接收 path，直接返回 workspace 信息（不走 dialog） |

修改现有通道：

| 通道 | 变更 |
|------|------|
| `workspace:openFolder` | 完成后调用 `addRecentFolder()` + `setTitle()` |

### 5. 渲染进程变更

**WelcomePage**：
- 新增最近文件夹列表区域
- 从 `recent:getList` IPC 获取数据
- 每条显示文件夹名和路径，点击调用 `recent:openFolder`
- 提供"清除最近记录"操作

**App.tsx**：
- `openFolder` 流程不变（走 dialog）
- 新增 `openRecentFolder(path)` 流程（直接打开指定路径，不走 dialog）
- 菜单中增加"最近打开"子菜单或列表

**Preload**：
- 暴露 `getRecentFolders()` 和 `openRecentFolder(path)` API

### 6. 应用名称

| 文件 | 字段 | 旧值 | 新值 |
|------|------|------|------|
| `package.json` | `description` | `An Electron application with React and TypeScript` | `本地 Markdown Wiki 阅读器` |
| `package.json` | `author` | `example.com` | `wiki-reader` |
| `package.json` | `homepage` | `https://electron-vite.org` | 删除 |

`electron-builder.yml` 的 `productName: Wiki Reader` 和 `appId: com.wiki-reader.app` 已经正确，无需修改。

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/main/recent-folders.ts` | 新建 |
| `src/main/window.ts` | 修改 — 无 API 变更，标题由 IPC handler 设置 |
| `src/main/index.ts` | 修改 — 单实例锁、second-instance、Jump List 初始化 |
| `src/main/ipc-handlers.ts` | 修改 — 新增 IPC、openFolder 后更新标题和最近列表 |
| `src/preload/index.ts` | 修改 — 暴露最近文件夹 API |
| `src/renderer/src/App.tsx` | 修改 — 新增 openRecentFolder 流程 |
| `src/renderer/src/components/WelcomePage.tsx` | 修改 — 展示最近文件夹列表 |
| `package.json` | 修改 — 更新元数据 |

## 不做的事

- 不实现最近文件夹的拖拽排序
- 不实现自定义 Jump List 图标（使用应用默认图标）
- 不修改 WelcomePage 的整体布局风格（只在现有布局下追加最近列表）

# Windows Only Window Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除主进程窗口生命周期和标题栏配置中的 macOS 兼容分支，仅保留 Windows 行为。

**Architecture:** 只修改 Electron 主进程入口和窗口创建逻辑。窗口创建固定使用 Windows 的隐藏标题栏和 `titleBarOverlay`；应用生命周期在所有窗口关闭时直接退出。

**Tech Stack:** Electron 33、TypeScript、electron-vite。

---

### Task 1: 简化窗口创建配置

**Files:**
- Modify: `src/main/window.ts`

- [ ] **Step 1: 移除平台判断**

删除 `isMac` 和 `isWin` 常量。

- [ ] **Step 2: 固定使用 Windows 标题栏配置**

将 `BrowserWindow` 选项中的平台分支替换为固定配置：

```ts
titleBarStyle: 'hidden',
backgroundColor: '#fafafa',
titleBarOverlay: {
  symbolColor: '#333333',
  height: 32
},
```

- [ ] **Step 3: 确认不再引用 macOS 专用配置**

检查 `src/main/window.ts` 中不再出现 `darwin`、`hiddenInset`、`trafficLightPosition`。

### Task 2: 简化应用生命周期

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 移除 macOS activate 行为**

删除 `app.on('activate', ...)` 代码块。

- [ ] **Step 2: 窗口全部关闭时直接退出**

将 `window-all-closed` 处理改为：

```ts
app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 3: 清理不再使用的导入**

如果 `BrowserWindow` 仅用于 `activate` 分支，删除 `src/main/index.ts` 中的 `BrowserWindow` 导入。

### Verification

- [ ] **Step 1: 静态检查相关关键字**

使用内容搜索确认主进程不再包含 macOS 专用窗口处理关键字：`darwin`、`hiddenInset`、`trafficLightPosition`、`activate`。

- [ ] **Step 2: 用户在 Windows 宿主机验证**

由于当前环境是 WSL2，按项目约束不运行 `npm run build`、`npm run dev` 或 Electron 命令。用户在 Windows 终端执行 `npm run build` 或 `npm run dev` 验证。

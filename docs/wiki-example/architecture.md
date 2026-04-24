# 架构与流程图

本文档使用 Mermaid 图表展示 Wiki Reader 的架构设计，并演示各种 Mermaid 图表类型。

相关文档：
- [代码示例](code-examples.md) — 各语言代码高亮
- [高级排版](guide/advanced.md) — 表格与数学公式

## 系统架构

```mermaid
graph TB
    subgraph 主进程
        A[Electron Main] --> B[窗口管理]
        A --> C[文件系统]
        A --> D[终端管理]
    end

    subgraph 渲染进程
        E[React App] --> F[侧栏组件]
        E --> G[Markdown 渲染器]
        E --> H[CodeMirror 编辑器]
        E --> I[终端面板]
    end

    subgraph 预加载层
        J[contextBridge API]
    end

    B <--> J
    C <--> J
    D <--> J
    J <--> E
```

## 文件打开流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant R as 渲染进程
    participant P as 预加载层
    participant M as 主进程
    participant FS as 文件系统

    U->>R: 点击"打开文件夹"
    R->>P: ipcRenderer.invoke('open-folder')
    P->>M: ipcMain.handle
    M->>U: dialog.showOpenDialog
    U->>M: 选择文件夹路径
    M->>FS: 读取目录结构
    FS-->>M: 文件列表
    M-->>P: 返回目录树
    P-->>R: 渲染文件树
    R-->>U: 显示侧栏文件列表
```

## 状态管理

```mermaid
stateDiagram-v2
    [*] --> 空闲
    空闲 --> 加载中: 打开文件
    加载中 --> 阅读模式: 加载完成
    加载中 --> 错误: 文件不存在
    阅读模式 --> 编辑模式: 切换编辑
    编辑模式 --> 阅读模式: 保存 / 取消
    阅读模式 --> 加载中: 切换文件
    编辑模式 --> 加载中: 切换文件
    错误 --> 空闲: 确认
```

## 用户界面布局

```mermaid
graph LR
    subgraph 主窗口
        direction TB
        A[标题栏] --- B[工具栏]
        B --- C[内容区域]
    end

    subgraph 内容区域
        direction LR
        D[侧栏<br/>文件/标题] --- E[主面板<br/>阅读/编辑]
        E --- F[终端面板<br/>可收起]
    end

    C --> D
```

## 开发阶段甘特图

```mermaid
gantt
    title Wiki Reader 开发计划
    dateFormat YYYY-MM-DD
    axisFormat %m/%d

    section 基础
    项目脚手架           :p1, 2026-04-20, 3d
    文件浏览器           :p2, after p1, 4d

    section 内容
    Markdown 渲染        :p3, after p2, 4d
    代码编辑器           :p4, after p3, 4d

    section 完善
    主题切换             :p5, after p4, 3d
    终端面板             :p6, after p5, 3d
    多窗口与错误处理      :p7, after p6, 4d
```

## 技术依赖关系

```mermaid
graph TD
    Electron --> React
    Electron --> node-pty
    React --> markdown-it
    React --> highlight.js
    React --> CodeMirror6[CodeMirror 6]
    Electron --> chokidar
    React --> xterm.js

    style Electron fill:#47848f,color:#fff
    style React fill:#61dafb,color:#000
    style node-pty fill:#68a063,color:#fff
    style CodeMirror6 fill:#d skipping220b2,color:#fff
    style xterm.js fill:#252526,color:#fff
```

## 类图

```mermaid
classDiagram
    class Workspace {
        +string rootPath
        +FileNode[] fileTree
        +loadDirectory(path: string) FileNode[]
        +readFile(path: string) string
        +watchFiles(callback: Function) void
    }

    class FileNode {
        +string name
        +string path
        +boolean isDirectory
        +FileNode[] children
    }

    class ThemeManager {
        +Theme current
        +toggle() void
        +persist() void
    }

    class TerminalManager {
        +Terminal[] instances
        +create(cwd: string) Terminal
        +dispose(id: string) void
    }

    Workspace "1" --> "*" FileNode : contains
    Workspace --> ThemeManager : uses
    Workspace --> TerminalManager : uses
```

## 饼图

```mermaid
pie title 代码量分布（估算）
    "TypeScript/React" : 45
    "CSS/样式" : 15
    "主进程 (Electron)" : 20
    "配置文件" : 10
    "测试" : 10
```

---

*上一篇：[代码示例](code-examples.md) | 下一篇：[图片引用](guide/images.md)*

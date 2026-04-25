# P2: 低优先级边缘情况与潜在风险修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 个低优先级问题，包括 FileTreeNode key 冲突、图片重复 IPC 调用、大图片内存占用、Markdown HTML 渲染风险、窗口关闭超时保护。

**Architecture:** 各修复涉及不同层面（组件渲染逻辑、图片加载策略、内存管理、安全配置、窗口生命周期），相互独立可并行执行。

**Tech Stack:** React 18、TypeScript、Electron 33

**前置条件:** P0 关键 Bug 和 P1 中等优先级修复已完成。

---

## 问题清单

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| 11 | FileTreeNode key 仅用 name，同级可能冲突 | `FileList.tsx` | 同名文件夹/文件渲染异常 |
| 12 | 图片加载重复 IPC 调用 | `MarkdownView.tsx` | 不必要的文件 I/O |
| 13 | 大图片以 base64 存于状态 | `MarkdownView.tsx` | 内存占用高 |
| 14 | markdown-it 允许原始 HTML | `markdown.ts` | 恶意 HTML 可能破坏布局 |
| 15 | 渲染进程挂起时窗口无法关闭 | `window.ts`、`preload/index.ts` | 应用卡死 |

---

### Task 11: 修复 FileTreeNode key 冲突

**Files:**
- Modify: `src/renderer/src/components/FileList.tsx`

**问题分析**: `<FileTreeNodeComponent key={node.name}>` 在同一层级下如果存在同名目录和文件（如 `notes/` 文件夹和 `notes.md` 文件），key 会冲突。但根据 `buildFileTree` 的逻辑，文件 `notes.md` 的 tree node name 是 `notes.md`，文件夹 `notes/` 的 node name 是 `notes`，所以实际冲突场景是：同级存在一个文件夹 `notes` 和一个文件（没有扩展名）`notes`。这非常罕见但理论可能。

- [ ] **Step 1: 将 key 改为使用 relativePath**

relativePath 在全局唯一，不会冲突：

```tsx
// FileList.tsx 中的两处 key 修改
<FileTreeNodeComponent
  key={node.relativePath}
  node={node}
  // ...
/>
```

递归子节点同理：

```tsx
{node.children.map((child) => (
  <FileTreeNodeComponent
    key={child.relativePath}
    node={child}
    // ...
  />
))}
```

- [ ] **Step 2: 验证**

- 创建包含同名（无扩展名）文件和文件夹的目录结构
- 确认两者都能正确显示，没有 React key 警告

---

### Task 12: 避免图片加载重复 IPC 调用

**Files:**
- Modify: `src/renderer/src/components/MarkdownView.tsx`

**问题分析**: 当一张图片加载完成触发 `setLoadedImages` → `activeImageUrls` 变化 → 图片加载 effect 重新运行 → 其他尚未完成的图片被重新发起请求。虽然旧 effect 的 cleanup 设 `cancelled = true` 让旧响应被忽略，但主进程侧的 IPC 处理已经执行了文件读取。

- [ ] **Step 1: 将图片加载从逐个触发状态改为批量收集后一次性更新**

使用 ref 追踪正在加载中的图片，避免重复请求：

```tsx
const loadingRef = useRef<Set<string>>(new Set())
```

- [ ] **Step 2: 修改图片加载 effect，检查 loadingRef**

```tsx
useEffect(() => {
  if (!workspaceRootPath || !currentFilePath) return

  let cancelled = false
  const localSrcs = collectLocalImageSrcs(renderedHtml)
  const unloadedSrcs = localSrcs.filter(
    (src) => !activeImageUrls[src] && !loadingRef.current.has(src)
  )
  if (unloadedSrcs.length === 0) return

  for (const localSrc of unloadedSrcs) {
    loadingRef.current.add(localSrc)
  }

  for (const localSrc of unloadedSrcs) {
    const setImageSrc = (src: string): void => {
      if (cancelled) return
      loadingRef.current.delete(localSrc)
      setLoadedImages((current) => ({
        key: imageContextKey,
        urls: {
          ...(current.key === imageContextKey ? current.urls : {}),
          [localSrc]: src
        }
      }))
    }

    // ... 原有加载逻辑保持不变（readAsset / readAbsoluteAsset）
  }

  return () => {
    cancelled = true
    for (const localSrc of unloadedSrcs) {
      loadingRef.current.delete(localSrc)
    }
  }
}, [activeImageUrls, currentFilePath, imageContextKey, renderedHtml, workspaceRootPath])
```

- [ ] **Step 3: 验证**

- 打开包含多张图片的文档
- 观察 DevTools Network/Console，确认每张图片只触发一次 IPC 调用
- 图片全部正常显示

---

### Task 13: 优化大图片内存占用

**Files:**
- Modify: `src/renderer/src/components/MarkdownView.tsx`
- Modify: `src/renderer/src/hooks/useDocument.ts`（或新建清理逻辑）

**问题分析**: 所有本地图片以 `data:...;base64,...` 字符串形式存入 React 状态。一张 5MB 的图片会产生约 6.7MB 的 base64 字符串。多张图片同时存在于状态中会显著增加内存。

- [ ] **Step 1: 改用 Blob URL 代替 Data URL**

修改图片加载回调，将 base64 dataUrl 转为 Blob URL：

```tsx
function dataUrlToBlobUrl(dataUrl: string): string {
  const [meta, base64] = dataUrl.split(',')
  const mimeMatch = meta.match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}
```

在图片加载成功时：

```tsx
if (result.success && result.dataUrl) {
  setImageSrc(dataUrlToBlobUrl(result.dataUrl))
}
```

- [ ] **Step 2: 在组件卸载或图片替换时释放 Blob URL**

添加清理 effect：

```tsx
useEffect(() => {
  return () => {
    // 组件卸载时释放所有 Blob URL
    const urls = loadedImages.urls
    for (const url of Object.values(urls)) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    }
  }
}, [])

// 当 loadedImages 更新时，释放被替换的旧 URL
const prevUrlsRef = useRef<Record<string, string>>({})
useEffect(() => {
  const prev = prevUrlsRef.current
  const current = loadedImages.urls
  for (const [key, url] of Object.entries(prev)) {
    if (url.startsWith('blob:') && current[key] !== url) {
      URL.revokeObjectURL(url)
    }
  }
  prevUrlsRef.current = { ...current }
}, [loadedImages.urls])
```

- [ ] **Step 3: 验证**

- 打开包含大图片（>2MB）的文档
- 观察 Chrome DevTools Memory 面板，确认内存增长可控
- 切换文件后旧图片的 Blob URL 被释放

---

### Task 14: 加强 Markdown HTML 渲染安全

**Files:**
- Modify: `src/renderer/src/utils/markdown.ts`

**问题分析**: `html: true` 允许 Markdown 中嵌入任意 HTML。结合 `dangerouslySetInnerHTML`，恶意或格式错误的 HTML 可能破坏页面布局（如未闭合的 `<div>` 影响外层布局）。

由于内容来自用户本地文件，XSS 攻击风险较低（同源上下文），但布局破坏仍需考虑。

- [ ] **Step 1: 保留 html: true 但添加 sanitizer**

使用 `sanitize-html` 库过滤危险标签和属性：

```bash
pnpm add sanitize-html
pnpm add -D @types/sanitize-html
```

- [ ] **Step 2: 在 renderMarkdown 中添加清理**

```tsx
import sanitizeHtml from 'sanitize-html'

export function renderMarkdown(source: string): string {
  const raw = md.render(source)
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'pre', 'code', 'blockquote', 'table', 'thead', 'tbody',
      'tr', 'th', 'td', 'details', 'summary', 'sup', 'sub',
      'mark', 'abbr', 'del', 'ins', 'input'
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'data-local-src', 'data-broken'],
      a: ['href', 'title', 'target', 'rel'],
      code: ['class'],
      pre: ['class'],
      span: ['class', 'style'],
      div: ['class', 'style'],
      input: ['type', 'checked', 'disabled'],
      '*': ['id', 'class']
    },
    allowedStyles: {
      '*': {
        // 允许安全的内联样式
        'color': [/^#/],
        'background-color': [/^#/],
        'text-align': [/^(left|center|right)$/],
      }
    },
    // 允许 code 中的 class（用于 highlight.js）
    allowedClasses: {
      code: [/^(hljs|language-\w+|[\w-]+)$/],
      pre: [/^hljs$/],
      span: [/^hljs[\w-]*$/]
    }
  })
}
```

- [ ] **Step 3: 验证**

- 包含 `<script>alert(1)</script>` 的 Markdown 文件，script 标签被过滤
- 正常的 HTML 标签（表格、图片等）正常显示
- highlight.js 的代码高亮 class 不被移除
- 标题的 `id` 属性保留（用于锚点跳转）

---

### Task 15: 添加窗口关闭超时保护

**Files:**
- Modify: `src/main/window.ts`
- Modify: `src/main/index.ts`

**问题分析**: 窗口关闭被 `e.preventDefault()` 阻止，等待渲染进程异步完成 `flushSave()` 后调 `confirmClose()` → `win.destroy()`。如果渲染进程无响应，窗口永远无法关闭。

- [ ] **Step 1: 添加超时强制关闭**

```tsx
// window.ts

const CLOSE_TIMEOUT = 3000 // 3 秒超时

win.on('close', (e) => {
  e.preventDefault()
  win.webContents.send('window:before-close')

  // 超时后强制关闭
  const timer = setTimeout(() => {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }, CLOSE_TIMEOUT)

  // 正常关闭时清除超时
  win.once('closed', () => {
    clearTimeout(timer)
  })
})
```

- [ ] **Step 2: 在渲染进程侧优化 close 处理**

在 `App.tsx` 的 `onBeforeClose` 中添加 try-catch 和超时：

```tsx
useEffect(() => {
  const unsubscribe = window.api.onBeforeClose(async () => {
    try {
      await Promise.race([
        flushSave(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('save timeout')), 2000)
        )
      ])
    } catch {
      // 超时或出错，跳过保存
    }
    window.api.confirmClose()
  })
  return unsubscribe
}, [flushSave])
```

- [ ] **Step 3: 验证**

- 正常修改文件后关闭窗口，文件被保存
- 模拟渲染进程卡死（如在 DevTools 中暂停），3 秒后窗口强制关闭
- 未修改文件时关闭窗口，立即关闭（不等待超时）

---

## 验证清单

完成所有 Task 后：

- [ ] 包含同名文件和文件夹的目录结构正常显示
- [ ] 多图片文档中每张图片只触发一次文件读取
- [ ] 大图片文档内存占用可控，切换文件后旧 Blob URL 被释放
- [ ] Markdown 中的 `<script>` 被过滤，正常 HTML 标签和代码高亮不受影响
- [ ] 渲染进程无响应时窗口能在 3 秒内强制关闭

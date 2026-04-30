# 高风险性能问题修复设计

日期：2026-04-28

## 背景

`docs/performance-review/high-risks.md` 列出了 5 个高风险项。严重风险已在 2026-04-26 修复。本次修复覆盖全部高风险项。

## 修复清单

| # | 风险 | 核心改动 |
|---|------|----------|
| 1 | 标题提取重复完整 Markdown 解析 | 轻量行扫描替代 MarkdownIt render |
| 2 | heading 插件 O(n²) token 查找 | 索引循环替代 indexOf |
| 3 | 本地图片以 data URL 存入 React state | ArrayBuffer + Blob URL + 批量更新 |
| 4 | 大文件树构建和渲染无虚拟化 | Map 加速构建 + 虚拟滚动 |
| 5 | 长文档多份完整内容副本 | originalContent 移入 useRef |

## 修复 1：标题提取改为轻量行扫描

### 当前问题

`useHeadings(doc.content)` 在 `App.tsx:20` 始终执行。`extractRenderedHeadings`（`markdown.ts:46-86`）每次创建临时 `MarkdownIt` 实例并调用 `render(source)`，触发完整解析和 highlight.js 代码高亮。预览模式下 `MarkdownView.tsx:73-79` 再做一次完整解析。

### 方案

#### 1.1 新建 `extractHeadingsFromSource` 函数

在 `src/renderer/src/utils/headings.ts` 中实现纯文本行扫描：

```
export function extractHeadingsFromSource(source: string): Heading[]
```

逻辑：
1. 按行分割 `source`。
2. 对每行匹配 `/^(#{1,6})\s+(.+)$/`，提取 level（`#` 个数）和 text（去除尾部 `#` 闭合标记，即 `text.replace(/\s+#+\s*$/, '').trim()`）。
3. ID 生成与 `heading_ids` 插件保持完全一致：
   - `baseId = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '')`
   - 重复计数：维护 `Map<string, number>`，第 N 次出现的 baseId 生成 `${baseId}-${N}`（从 1 计数，首次不加后缀）。
4. 返回 `Heading[]`。

#### 1.2 删除 `extractRenderedHeadings`

从 `markdown.ts` 中删除整个 `extractRenderedHeadings` 函数（第 46-86 行）及其内部的临时 `MarkdownIt` 实例。

#### 1.3 更新 `headings.ts` 调用

`extractHeadings` 改为调用 `extractHeadingsFromSource`，不再导入 `extractRenderedHeadings`。

#### 1.4 源码模式跳过标题提取

`useHeadings` 签名改为 `useHeadings(content: string, mode: 'preview' | 'source')`。

- `mode === 'source'` 时 `useMemo` 返回空数组 `[]`，不执行扫描。
- `App.tsx` 调用处增加 `doc.mode` 参数。

### 影响文件

- `src/renderer/src/utils/headings.ts` — 重写
- `src/renderer/src/utils/markdown.ts` — 删除 `extractRenderedHeadings`
- `src/renderer/src/hooks/useHeadings.ts` — 增加 mode 参数
- `src/renderer/src/App.tsx:20` — 传 `doc.mode`

### 约束

- 标题 ID 生成规则必须与 `heading_ids` 插件一致，否则标题跳转失效。
- 正则方案无法处理 Markdown 嵌套语法（如 `# **bold** title`），但实际 wiki 标题极少有复杂内联格式，可接受。
- 未来如需处理嵌套格式，可改用 `md.parse()` + token 遍历（不开高亮）。

### 测试

新增 `tests/unit/headings-extract.test.ts`：
- 基本标题提取（各 level）
- 重复标题 ID 去重
- 中文标题 ID
- 空内容返回空数组
- 尾部 `#` 闭合标记处理

## 修复 2：heading 插件索引循环

### 当前问题

`markdown.ts:26` 和 `markdown.ts:68` 使用 `state.tokens.indexOf(token)` 查找当前位置，对每个 token 执行线性查找，长文档退化为 O(n²)。

### 方案

两处 `heading_ids` 插件规则改为索引循环：

```ts
md.core.ruler.push('heading_ids', (state) => {
  headingIds.clear()
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i]
    if (token.type === 'heading_open') {
      const inline = state.tokens[i + 1]
      // ... 逻辑不变
    }
  }
})
```

### 影响文件

- `src/renderer/src/utils/markdown.ts` — 两处 `heading_ids` 规则

### 测试

新增 `tests/unit/markdown-heading-ids.test.ts`：
- 单标题生成正确 ID
- 重复标题 ID 去重（与 `headings-extract.test.ts` 生成结果一致）
- 中文标题 ID

## 修复 3：图片加载优化

### 当前问题

- `workspace.ts:111/121` 返回 `data:${mimeType};base64,...`，base64 编码膨胀 33%。
- `MarkdownView.tsx:161-167` 每张图片加载完成各自 `setLoadedImages`，触发整篇 HTML 重算。
- 切换文档时旧 data URL 缓存无显式释放。

### 方案

#### 3.1 主进程返回 ArrayBuffer

`readWorkspaceAsset` 和 `readAbsoluteImageFile` 改为返回 `{ buffer: ArrayBuffer, mimeType: string }`：

```ts
export async function readWorkspaceAsset(rootPath: string, relativePath: string): Promise<{ buffer: ArrayBuffer; mimeType: string }>
```

不再拼接 data URL 字符串。IPC handler 相应更新返回字段。

#### 3.2 IPC 返回格式变更

- `workspace:readAsset` 返回 `{ success: true, buffer: ArrayBuffer, mimeType: string }` 或 `{ success: false, error: string }`
- `workspace:readAbsoluteAsset` 同上

preload 层 `readAsset` 和 `readAbsoluteAsset` 返回类型相应更新。

#### 3.3 渲染进程用 Blob URL

`MarkdownView` 的图片加载逻辑改为：

1. 收到 `{ buffer, mimeType }` 后：`URL.createObjectURL(new Blob([buffer], { type: mimeType }))`
2. Blob URL 存入 `loadedImages` state（替代 data URL）
3. `imageContextKey` 切换时，遍历旧 `loadedImages` 中所有值，调用 `URL.revokeObjectURL`
4. 组件卸载时（`useEffect` cleanup）批量 `revokeObjectURL`

#### 3.4 批量收集图片加载结果

- 新建 `pendingImagesRef: useRef<Map<string, string>>` 收集已加载但未提交的 Blob URL
- 所有图片 promise 完成后，一次性 `setLoadedImages`
- 使用 `Promise.allSettled` 等待全部完成

### 影响文件

- `src/main/workspace.ts` — `readWorkspaceAsset`、`readAbsoluteImageFile` 返回类型
- `src/main/ipc-handlers.ts` — 两处 asset handler 返回格式
- `src/preload/index.ts` — `readAsset`、`readAbsoluteAsset` 类型
- `src/renderer/src/env.d.ts` — window.api 类型声明
- `src/renderer/src/components/MarkdownView.tsx` — 图片加载与 Blob URL 管理

### 测试

更新 `tests/unit/workspace-asset.test.ts`：
- 验证返回 `{ buffer: ArrayBuffer, mimeType: string }`
- 验证 buffer 内容与文件原始二进制一致

更新 `tests/unit/markdown-images.test.ts`：
- `replaceLocalImageSrc` 测试中 `loadedImages` 的值从 `data:image/...` 改为 `blob:...`

## 修复 4：文件树构建 + 虚拟滚动

### 当前问题

- `buildFileTree` 中 `current.find` 线性查找目录节点。
- 展开目录时递归渲染全部可见 DOM，无虚拟滚动。
- `useLayoutEffect` 中全量收集目录路径。

### 方案

#### 4.1 Map 加速树构建

`buildFileTree` 中对每一层目录维护 `Map<string, FileTreeNode>` 替代 `Array.find`：

```ts
export function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const rootMap = new Map<string, FileTreeNode>()

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    let currentList = root
    let currentMap = rootMap
    let prefix = ''

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      prefix = prefix ? prefix + '/' + dirName : dirName
      let existing = currentMap.get(dirName)
      if (!existing) {
        existing = { name: dirName, relativePath: prefix, children: [] }
        currentMap.set(dirName, existing)
        currentList.push(existing)
      }
      currentList = existing.children
      // 子层需要自己的 map
      ...
    }
    ...
  }
}
```

每个目录节点附带一个 `childrenMap`（可通过 WeakMap 关联，避免修改 FileTreeNode 类型）。

实际实现使用外部 `WeakMap<FileTreeNode, Map<string, FileTreeNode>>` 存放 childrenMap，不修改 `FileTreeNode` 类型签名。

#### 4.2 虚拟滚动

引入 `VirtualFileList` 组件替代当前递归 `FileTreeNodeComponent` 渲染。

核心设计：

1. **扁平化可见节点**：根据 `collapsed` 集合，将树递归展开为一维数组 `VisibleNode[]`，每项包含 `{ node, depth }`。用 `useMemo` 以 `[tree, collapsed]` 为依赖缓存。

2. **固定行高**：每行 28px（与现有 `.file-node` 高度一致）。总高度 = `visibleNodes.length * 28`。

3. **虚拟渲染**：
   - 容器 `div` 设置 `overflow-y: auto`，高度占满侧栏
   - 内部撑高 `div` 高度为 `totalHeight`
   - 根据 `scrollTop` 计算可见范围 `[startIndex, endIndex]`
   - 只渲染可见行 + 上下各 2 行缓冲
   - 每行用 `position: absolute` + `top: index * 28` + `width: 100%`

4. **滚动事件**：`onScroll` 更新 `scrollTop` state，用 `useMemo` 推算可见行。

5. **展开/折叠**：`toggleDir` 更新 `collapsed` 集合 → `visibleNodes` 重算 → 虚拟列表自动更新。

#### 4.3 去掉 useLayoutEffect 全量遍历

`mergeCollapsedWithNewDirectories` 改为基于 Map 的差异比较，避免 `collectDirectoryPaths` 递归遍历。或保留现有逻辑（仅在文件树变更时运行，不在渲染热路径上）。

考虑到 `mergeCollapsedWithNewDirectories` 只在 `tree` 引用变化时触发（文件变更事件后），频率低，保留现有实现即可。

### 影响文件

- `src/renderer/src/components/FileList.tsx` — 重写 `buildFileTree` + 新增 `VirtualFileList` 渲染
- `src/renderer/src/App.css` 或新 `file-list.css` — 虚拟滚动容器样式

### 测试

更新 `tests/unit/file-list-tree.test.ts`：
- `buildFileTree` 现有测试不变
- 新增：1000+ 文件场景下 `buildFileTree` 不出错
- 新增：虚拟列表 `flattenVisibleNodes` 正确处理展开/折叠

## 修复 5：originalContent 移入 useRef

### 当前问题

`DocumentState` 中 `content` 和 `originalContent` 各持完整字符串副本。长文档时两份副本同时在 React state 中，阻止 GC。

### 方案

#### 5.1 从 DocumentState 移除 originalContent

`DocumentState` 类型删除 `originalContent` 字段：

```ts
export type DocumentState = {
  file: WikiFile | null
  content: string
  mode: 'preview' | 'source'
  dirty: boolean
  loading: boolean
}
```

#### 5.2 useDocument 内部用 useRef 存储

新增 `originalContentRef = useRef('')`。

- `loadContent`：设置 `docRef.current = { file, content, mode: 'preview', dirty: false, loading: false }`，同时 `originalContentRef.current = content`。
- `markDirty`：只设 `dirty: true`，不比较内容。
- `saveCurrentDoc`：比较 `savedContent !== originalContentRef.current` 判断是否需要保存。保存成功后 `originalContentRef.current = savedContent`。
- `syncContent`：`dirty` 改为 `content !== originalContentRef.current`。
- `flushSave`：不变。

#### 5.3 所有引用 originalContent 的地方更新

搜索所有访问 `doc.originalContent` 或 `prev.originalContent` 的代码，替换为 `originalContentRef.current`。

### 影响文件

- `src/renderer/src/types.ts` — `DocumentState` 删除 `originalContent`
- `src/renderer/src/hooks/useDocument.ts` — `originalContent` 移入 ref

### 测试

无新增测试文件。现有 `pnpm build` 类型检查覆盖。

## 执行顺序

建议按依赖关系排序：

1. **修复 2**（heading 索引循环）— 最小改动，独立
2. **修复 5**（originalContent useRef）— 小改动，独立
3. **修复 1**（标题提取行扫描）— 依赖修复 2 的 ID 一致性
4. **修复 3**（图片 Blob URL）— IPC 层改动，独立
5. **修复 4**（虚拟滚动）— 最大改动，放最后

## 验证

WSL2 环境不运行 pnpm 脚本。实现后建议在 Windows 宿主机执行：

```bash
pnpm test
pnpm build
pnpm dev
```

手工验收：

- 打开含代码块的 Markdown 文件，标题导航正常跳转。
- 源码模式输入时标题列表为空，切回预览后标题恢复。
- 包含本地图片的文档正常显示，切换文档后内存可回落。
- 打开 5000+ 文件的目录，侧栏展开大目录不卡顿。
- 编辑文档后保存，dirty 状态判断正确。

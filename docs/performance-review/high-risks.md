# 高风险修复建议书

## 风险 1：Markdown 预览与标题提取重复完整解析

### 关键位置

- `src/renderer/src/App.tsx:19`
- `src/renderer/src/hooks/useHeadings.ts:4-5`
- `src/renderer/src/utils/headings.ts:4-5`
- `src/renderer/src/utils/markdown.ts:46-86`
- `src/renderer/src/components/MarkdownView.tsx:73-79`

### 问题说明

`useHeadings(doc.content)` 在 `App` 中始终执行。标题提取通过 `extractRenderedHeadings` 新建 `MarkdownIt` 并完整 `render(source)`。预览模式下 `MarkdownView` 又执行一次 `renderMarkdown(source)`。

### 可能后果

- 打开长文档时至少两次完整 Markdown 解析。
- 大量代码块触发同步 highlight.js 高亮，阻塞 UI。
- 源码编辑时内容变化仍会触发标题提取，拖慢输入。

### 建议方案

1. 将标题提取改为轻量行扫描，识别 `#` 到 `######` 标题。
2. 或使用 markdown-it token parse，但不要执行完整 HTML render 和代码高亮。
3. 源码模式下暂停标题提取，切回预览后再计算。
4. 对标题提取增加 debounce 或 idle 调度。
5. 长期将 Markdown 渲染和标题提取合并为一次解析结果。

### 验收标准

- 源码模式连续输入不会每次触发完整 Markdown render。
- 长文档切换预览时只发生必要的一次主渲染。
- 标题导航与预览标题 ID 保持一致。

## 风险 2：Markdown heading 插件存在 O(n²) token 查找

### 关键位置

- `src/renderer/src/utils/markdown.ts:22-40`
- `src/renderer/src/utils/markdown.ts:64-83`

### 问题说明

heading 插件在遍历 token 时使用 `state.tokens.indexOf(token)` 查找当前位置。对每个 token 都执行一次线性查找，长文档 token 数量大时退化为 O(n²)。

### 建议方案

1. 将 `for...of` 改为索引循环。
2. 通过 `state.tokens[i + 1]` 获取 heading inline token。
3. 渲染和标题提取两处逻辑保持一致。

### 验收标准

- 长文档渲染时间随 token 数量接近线性增长。
- 重复标题 ID 生成规则不变。
- 标题跳转和目录高亮仍正常。

## 风险 3：本地图片以 data URL 存入 React state

### 关键位置

- `src/main/workspace.ts:92-111`
- `src/renderer/src/components/MarkdownView.tsx:68-82`
- `src/renderer/src/components/MarkdownView.tsx:132-211`

### 问题说明

图片文件被读取为 base64 data URL 后进入 React state。base64 字符串会放大内存占用，并且 React state、HTML 字符串、DOM 属性中都可能持有副本。

### 可能后果

- 大图片或大量图片文档导致内存峰值高。
- 每张图片加载完成都会触发 `setLoadedImages`，导致整篇 HTML 替换和 DOM 重建。
- 切换文档时旧图片缓存没有显式释放底层资源。

### 建议方案

1. 用 `Blob` + `URL.createObjectURL` 替代 data URL。
2. 文档切换或组件卸载时调用 `URL.revokeObjectURL`。
3. 图片加载结果批量提交，避免每张图片触发一次整篇 HTML 更新。
4. 切换 `imageContextKey` 时立即清空旧缓存。
5. 对超大图片增加尺寸或文件大小限制提示。

### 验收标准

- 打开包含多张大图的文档后，切换到无图片文档，内存可回落。
- 图片加载期间 UI 不应反复明显卡顿。
- 图片加载失败仍显示占位提示。

## 风险 4：大文件树构建和渲染无虚拟化

### 关键位置

- `src/renderer/src/components/FileList.tsx:11-40`
- `src/renderer/src/components/FileList.tsx:54-77`
- `src/renderer/src/components/FileList.tsx:156-226`

### 问题说明

每次文件列表刷新都重建整棵树。目录查找使用 `current.find`，宽目录下复杂度偏高。展开节点时递归渲染所有可见 DOM，没有虚拟滚动。

### 可能后果

- 几千到几万文件时文件树构建卡顿。
- 全部展开会瞬间创建大量 DOM 节点。
- `useLayoutEffect` 中整树遍历阻塞浏览器绘制。

### 建议方案

1. 构建树时使用 `Map` 记录当前层级目录节点。
2. 构建树时同步生成目录路径集合，减少额外遍历。
3. 将文件树渲染改为虚拟列表。
4. 限制全部展开规模，超过阈值提示用户。
5. 文件变更改为增量更新，减少整树重建。

### 验收标准

- 5,000+ Markdown 文件目录打开后侧栏仍可交互。
- 展开大目录不会导致长时间无响应。
- 文件新增、删除后文件树状态正确。

## 风险 5：长文档存在多份完整内容副本

### 关键位置

- `src/renderer/src/hooks/useDocument.ts:7-14`
- `src/renderer/src/hooks/useDocument.ts:55-63`
- `src/renderer/src/components/SourceEditor.tsx:32-33`
- `src/renderer/src/components/MarkdownView.tsx:73-82`

### 问题说明

同一文档可能同时存在于 `doc.content`、`doc.originalContent`、CodeMirror 内部文档、Markdown HTML 字符串、DOM 和图片缓存中。

### 建议方案

1. `originalContent` 改为 hash、版本号或保存快照策略。
2. 编辑态不保留渲染 HTML。
3. 预览态不强制保留编辑器实例。
4. 对超大文件给出提示，默认进入源码模式。

### 验收标准

- 打开 20MB+ 文档时内存峰值显著低于优化前。
- 保存和 dirty 状态判断仍准确。
- 预览/源码切换内容不丢失。

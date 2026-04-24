# 交叉引用与链接

本文档详细演示 Wiki 知识库中各种内部和外部链接方式。

## 相对路径链接

### 同级文件

指向同级目录下的文件：

- [基础格式演示](../getting-started.md)
- [代码示例](../code-examples.md)
- [架构图](../architecture.md)
- [首页](../README.md)

### 子目录文件

指向 `guide/` 目录下的文件：

- [图片引用](images.md)
- [高级排版](advanced.md)

### 嵌套子目录

- [开发日志](../notes/dev-log.md)

## 锚点跳转

### 当前文件内的锚点

链接到本文的各个标题：

- [相对路径链接](#相对路径链接)
- [锚点跳转](#锚点跳转)
- [外部链接](#外部链接)
- [自动链接](#自动链接)

### 跨文件锚点

跳转到其他文件的特定标题：

- [基础格式 - 任务列表](../getting-started.md#任务列表)
- [代码示例 - Rust](../code-examples.md#rust)
- [架构图 - 类图](../architecture.md#类图)
- [高级排版 - 数学公式](advanced.md#数学公式latex-风格)

## 外部链接

### 普通链接

- [GitHub](https://github.com)
- [MDN Web Docs](https://developer.mozilla.org)
- [Stack Overflow](https://stackoverflow.com)

### 带标题的链接

- [Electron](https://www.electronjs.org "Electron 官方网站")
- [React](https://react.dev "React 官方文档")
- [TypeScript](https://www.typescriptlang.org "TypeScript 官方网站")

### 自动链接

直接写 URL 也会被识别为链接：

- https://www.markdownguide.org
- https://commonmark.org

## 引用式链接

使用 `[文本][id]` 加 `[id]: url` 的方式定义链接：

我对 [Electron][electron] 和 [React][react] 都很感兴趣。
[TypeScript][ts] 让 JavaScript 开发更加安全。

[electron]: https://www.electronjs.org "Electron"
[react]: https://react.dev "React"
[ts]: https://www.typescriptlang.org "TypeScript"

## 邮箱链接

<user@example.com>

## 图片链接

图片也可以作为链接的目标：

[![横幅图](../img/banner.jpg)](../README.md)

## Wiki 风格的双括号链接

> **注意：** 标准 Markdown 不支持 `[[双括号]]` 链接语法。这是 Obsidian、VimWiki 等工具的扩展。此处仅作展示。

Wiki 风格的链接通常写作 `[[getting-started]]` 或 `[[getting-started|基础格式]]`，由特定工具解析。

## 嵌套引用中的链接

> 这是引用中的一段文字，包含一个 [外部链接](https://example.com)。
>
> > 嵌套引用中也可以有链接：
> > - [基础格式](../getting-started.md)
> > - [代码示例](../code-examples.md)

## 表格中的链接

| 名称 | 文档链接 | 备注 |
|------|----------|------|
| Electron | [官方文档](https://www.electronjs.org/docs) | 桌面应用框架 |
| React | [官方文档](https://react.dev) | UI 库 |
| markdown-it | [GitHub](https://github.com/markdown-it/markdown-it) | Markdown 解析器 |
| CodeMirror | [官方文档](https://codemirror.net) | 代码编辑器 |

## 链接测试场景

以下链接用于测试不同情况：

| 场景 | 链接 | 预期行为 |
|------|------|----------|
| 正常的相对路径 | [README](../README.md) | 正常跳转 |
| 不存在的文件 | [不存在的文件](nonexistent.md) | 显示错误或 404 |
| 外部链接 | [GitHub](https://github.com) | 在浏览器中打开 |
| 锚点到存在的标题 | [代码示例 - Shell](../code-examples.md#shell--bash) | 滚动到对应位置 |
| 锚点到不存在的标题 | [不存在的标题](../getting-started.md#不存在的标题) | 滚动到页面顶部 |

---

*上一篇：[高级排版](advanced.md) | 返回 [首页](../README.md)*

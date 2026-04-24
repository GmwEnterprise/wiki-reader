# 高级排版

本文档演示表格、脚注、数学公式等进阶 Markdown 特性。

相关文档：[图片引用](images.md) | [交叉引用](cross-reference.md)

## 表格

### 基本表格

| 功能 | 状态 | 负责人 | 备注 |
|------|------|--------|------|
| 文件浏览 | 已完成 | Alice | Phase 2 |
| Markdown 渲染 | 已完成 | Bob | Phase 3 |
| 代码编辑 | 已完成 | Charlie | Phase 4 |
| 主题切换 | 进行中 | Alice | Phase 5 |
| 终端面板 | 计划中 | Bob | Phase 6 |

### 对齐方式

| 左对齐 | 居中 | 右对齐 |
|:-------|:----:|-------:|
| 默认 | 居中 | 数字 |
| 文本 | 内容 | 1234.56 |
| 更多 | 数据 | 999.99 |

### 宽表格

| 项目 | 描述 | 优先级 | 预计工时 | 实际工时 | 状态 | 截止日期 |
|------|------|--------|----------|----------|------|----------|
| A-001 | 用户认证模块 | P0 | 5d | 4d | 完成 | 2026-04-15 |
| A-002 | 文件上传功能 | P1 | 3d | - | 进行中 | 2026-04-22 |
| A-003 | 搜索功能 | P1 | 4d | - | 待开始 | 2026-04-28 |
| A-004 | 导出 PDF | P2 | 2d | - | 待开始 | 2026-05-05 |
| A-005 | 性能优化 | P2 | 3d | - | 待开始 | 2026-05-10 |

## 脚注

这是一个带脚注的句子[^1]。也可以有多个脚注[^2]。脚注可以放在文档任意位置[^long]。

### 脚注引用示例

Markdown 由 John Gruber 于 2004 年创建[^3]。CommonMark 是一个标准化的 Markdown 规范[^4]。

[^1]: 这是第一个脚注的内容。
[^2]: 这是第二个脚注。脚注可以包含**格式化文本**和 `代码`。
[^long]: 这是一个较长的脚注。可以包含多段内容。
    第二行缩进四格。
    第三行同样缩进。
[^3]: John Gruber 的原文发布在 Daring Fireball 博客。
[^4]: CommonMark 项目始于 2012 年，目标是消除 Markdown 实现中的歧义。

## 数学公式（LaTeX 风格）

> **注意：** 公式渲染取决于 Wiki Reader 是否集成了数学公式插件（如 KaTeX / MathJax）。以下内容在未安装插件时会显示为原始 LaTeX。

### 行内公式

质能方程 $E = mc^2$ 是物理学最著名的公式之一。欧拉公式 $e^{i\pi} + 1 = 0$ 被誉为最美的数学等式。

### 块级公式

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

$$
\frac{\partial f}{\partial x} = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}
$$

### 矩阵

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

### 条件表达式

$$
f(x) = \begin{cases}
x^2 & \text{if } x \geq 0 \\
-x^2 & \text{if } x < 0
\end{cases}
$$

## 定义列表（HTML 方式）

由于标准 Markdown 不支持定义列表，可以使用 HTML：

<dl>
  <dt>Markdown</dt>
  <dd>一种轻量级标记语言，由 John Gruber 创建。</dd>

  <dt>CommonMark</dt>
  <dd>Markdown 的标准化规范，旨在消除各实现的歧义。</dd>

  <dt>Wiki Reader</dt>
  <dd>基于 Electron 的本地 Markdown 阅读器。</dd>
</dl>

## 折叠内容

<details>
<summary>点击展开：技术栈详情</summary>

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 33+ | 桌面应用框架 |
| React | 18 | UI 组件库 |
| TypeScript | 5 | 类型安全的 JavaScript |
| markdown-it | 14+ | Markdown 解析器 |
| CodeMirror | 6 | 代码编辑器 |
| xterm.js | 5+ | 终端模拟器 |

</details>

<details>
<summary>点击展开：一段代码</summary>

```javascript
const greeting = (name) => `Hello, ${name}!`;
console.log(greeting("Wiki Reader"));
```

</details>

## 缩写

*[HTML]: HyperText Markup Language
*[CSS]: Cascading Style Sheets
*[API]: Application Programming Interface

HTML 和 CSS 是 Web 开发的基础。通过 API 可以扩展功能。

---

*上一篇：[图片引用](images.md) | 下一篇：[交叉引用](cross-reference.md)*

# 图片引用与排版

本文档演示 Markdown 中各种图片引用方式。所有图片存放在上级目录的 `img/` 文件夹中。

相关文档：[交叉引用](cross-reference.md) | [高级排版](advanced.md)

## 基本图片

基本语法：`![替代文本](图片路径)`

![风景照片](../img/landscape.jpg)

上方是一张 800x400 的风景图片。

## 带标题的图片

带标题的图片（鼠标悬停时显示）：

![自然风光](../img/nature.jpg "来自 Picsum Photos 的随机自然风光")

## 不同尺寸的图片

### 宽幅横幅图

![横幅图片](../img/banner.jpg)

### 正方形图片

![方形图片](../img/square.jpg)

### 缩略图

![缩略图](../img/thumbnail.jpg)

上面是 300x200 的小图。

## 图片作为链接

点击图片跳转到首页：

[![点击回到首页](../img/thumbnail.jpg)](../README.md)

## 图片并排（使用 HTML）

当需要控制布局时，可以用 HTML 标签：

<div style="display: flex; gap: 10px; flex-wrap: wrap;">
  <img src="../img/thumbnail.jpg" alt="缩略图 1" width="200">
  <img src="../img/thumbnail.jpg" alt="缩略图 2" width="200">
  <img src="../img/thumbnail.jpg" alt="缩略图 3" width="200">
</div>

## 引用中的图片

> 这是一张引用中的图片：
>
> ![引用中的图片](../img/nature.jpg)
>
> 图片可以正常显示在引用块中。

## 列表中的图片

以下是三张图片的列表：

- ![图片一](../img/thumbnail.jpg) 缩略图一
- ![图片二](../img/nature.jpg) 自然风光
- ![图片三](../img/square.jpg) 方形图片

## 不存在的图片

用来测试图片加载失败的情况：

![不存在的图片](../img/nonexistent.jpg)

---

*返回 [首页](../README.md) | 下一篇：[高级排版](advanced.md)*

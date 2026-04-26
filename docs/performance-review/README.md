# 性能审查修复建议书总览

审查日期：2026-04-26

## 结论

当前项目在普通规模 Markdown wiki 下可以正常使用，但在长文档、大目录、多终端长程任务场景下存在明确的资源持续攀升风险。风险主要集中在三条链路：

- 编辑器与 Markdown 渲染：长文本编辑时存在全文复制、重复解析、同步高亮和多份内容副本。
- 文件树与工作区监听：大目录或频繁文件变化时可能触发 watcher 事件风暴和反复全量扫描。
- 多终端：长程命令大量输出时缺少 IPC 批处理、xterm 写入背压和后台标签限速。

## 文档清单

- `docs/performance-review/critical-risks.md`：严重风险修复建议，建议优先进入修复。
- `docs/performance-review/high-risks.md`：高风险修复建议，建议在严重风险之后处理。
- `docs/performance-review/medium-low-risks.md`：中低风险修复建议，可作为稳定性与体验优化批次。

## 建议修复顺序

1. 修复终端输出链路：输出批处理、缓冲上限、xterm 写入队列、后台标签限速。
2. 修复多窗口终端 ID 冲突：终端实例 key 改为 `windowId + terminalId`。
3. 修复编辑器输入链路：取消每次输入同步全文到 React state。
4. 修复文件监听链路：watcher debounce、扫描互斥、避免重复 watcher 泄漏。
5. 优化 Markdown 渲染链路：标题轻量提取、避免重复 render、修复 O(n²) token 查找。
6. 优化文件树和图片内存：虚拟化、Blob URL、缓存释放。

## 验收建议

由于当前运行环境为 WSL2，项目要求依赖安装、编译、运行都在 Windows 11 宿主机执行。修复后建议在 Windows 终端手动验证：

```bash
pnpm test
pnpm build
pnpm dev
```

建议额外手工压测：

- 打开 5MB、20MB、50MB Markdown 文档并切换预览/源码。
- 在源码模式连续输入 1 分钟，观察 CPU、内存和输入延迟。
- 打开包含 5,000+ Markdown 文件的目录。
- 执行持续大量输出命令，例如循环打印日志或构建监听任务。
- 同时打开多个终端标签和多个窗口，验证终端输出、关闭、切换是否互不影响。

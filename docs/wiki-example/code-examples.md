# 代码块与语法高亮1

本文档包含多种编程语言的代码示例，用于测试代码高亮渲染。

## 行内代码

使用 `console.log()` 输出调试信息。在 HTML 中用 `<div>` 创建块级元素。正则表达式 `/\d+/g` 匹配数字。

## JavaScript / TypeScript

```javascript
// 斐波那契数列 — 迭代实现
function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

console.log(fibonacci(10)); // 55
```

```typescript
// 泛型工具类型
type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

type UserPreview = Pick<User, "id" | "name">;

function getUserPreview(user: User): UserPreview {
  return { id: user.id, name: user.name };
}
```

## Python

```python
# 快速排序
def quicksort(arr: list[int]) -> list[int]:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)


data = [3, 6, 8, 10, 1, 2, 1]
print(quicksort(data))  # [1, 1, 2, 3, 6, 8, 10]
```

```python
# 异步 HTTP 请求
import asyncio
import aiohttp


async def fetch_json(url: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()
            return await response.json()


async def main():
    urls = [
        "https://api.github.com/users/octocat",
        "https://api.github.com/users/defunkt",
    ]
    results = await asyncio.gather(*[fetch_json(u) for u in urls])
    for r in results:
        print(r["login"])


asyncio.run(main())
```

## Rust

```rust
use std::collections::HashMap;

fn word_count(text: &str) -> HashMap<&str, usize> {
    let mut map = HashMap::new();
    for word in text.split_whitespace() {
        *map.entry(word).or_insert(0) += 1;
    }
    map
}

fn main() {
    let text = "the quick brown fox jumps over the lazy dog the fox";
    let counts = word_count(text);
    for (word, count) in &counts {
        println!("{}: {}", word, count);
    }
}
```

## Go

```go
package main

import (
	"fmt"
	"sync"
	"time"
)

func worker(id int, wg *sync.WaitGroup) {
	defer wg.Done()
	fmt.Printf("Worker %d starting\n", id)
	time.Sleep(time.Second)
	fmt.Printf("Worker %d done\n", id)
}

func main() {
	var wg sync.WaitGroup
	for i := 1; i <= 5; i++ {
		wg.Add(1)
		go worker(i, &wg)
	}
	wg.Wait()
}
```

## HTML / CSS

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>示例页面</title>
  <style>
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>你好，世界</h1>
      <p>这是一个示例页面。</p>
    </div>
  </div>
</body>
</html>
```

## Shell / Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:?请提供项目名称}"

echo "创建项目: $PROJECT_NAME"
mkdir -p "$PROJECT_NAME"/{src,tests,docs}
cat > "$PROJECT_NAME/package.json" << EOF
{
  "name": "$PROJECT_NAME",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest"
  }
}
EOF

echo "项目 $PROJECT_NAME 创建完成！"
```

## SQL

```sql
-- 查询每个部门平均薪资最高的前 3 名
WITH dept_avg AS (
    SELECT
        d.name AS department,
        AVG(e.salary) AS avg_salary,
        COUNT(*) AS employee_count
    FROM employees e
    JOIN departments d ON e.dept_id = d.id
    GROUP BY d.id, d.name
)
SELECT department, avg_salary, employee_count
FROM dept_avg
ORDER BY avg_salary DESC
LIMIT 3;
```

## JSON

```json
{
  "name": "wiki-reader",
  "version": "1.0.0",
  "description": "本地 Markdown Wiki 阅读器",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build"
  },
  "dependencies": {
    "markdown-it": "^14.0.0",
    "highlight.js": "^11.9.0"
  }
}
```

## YAML

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
```

## Diff

```diff
function greet(name) {
-  return "Hello, " + name;
+  return `Hello, ${name}!`;
}

- const port = 3000;
+ const port = process.env.PORT || 3000;
```

## 行号标记（部分渲染器支持）

```javascript {2,4-5}
function highlightDemo() {
  const important = "这行应该被高亮";    // 行 2
  const normal = "这行不高亮";
  const also = "这行也应该高亮";         // 行 4
  const andThis = "以及这行";             // 行 5
  return { important, normal, also, andThis };
}
```

---

*上一篇：[基础格式演示](getting-started.md) | 下一篇：[架构与流程图](architecture.md)*
